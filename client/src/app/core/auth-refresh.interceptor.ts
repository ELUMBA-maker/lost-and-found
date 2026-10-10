import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from "@angular/common/http";
import { inject } from "@angular/core";
import {
  Observable,
  catchError,
  finalize,
  map,
  shareReplay,
  switchMap,
  throwError,
} from "rxjs";
import { HttpClient } from "@angular/common/http";
import { AuthSessionService } from "./auth-session.service";

const RETRIED_AFTER_REFRESH = new HttpContextToken<boolean>(() => false);
let refreshRequest: Observable<string> | null = null;

function sessionExpiredError(url: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 401,
    statusText: "Unauthorized",
    url,
    error: { message: "Your session expired. Please sign in again." },
  });
}

export const authRefreshInterceptor: HttpInterceptorFn = (request, next) => {
  const isAuthEndpoint =
    request.url.includes("/api/auth/login") ||
    request.url.includes("/api/auth/register") ||
    request.url.includes("/api/auth/refresh");
  if (!request.url.startsWith("/api/") || isAuthEndpoint) return next(request);

  const http = inject(HttpClient);
  const session = inject(AuthSessionService);
  const accessToken = localStorage.getItem("accessToken");
  const authorizedRequest = accessToken
    ? request.clone({
        setHeaders: { Authorization: `Bearer ${accessToken}` },
      })
    : request;

  return next(authorizedRequest).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        request.context.get(RETRIED_AFTER_REFRESH)
      ) {
        return throwError(() => error);
      }

      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) {
        session.expire();
        return throwError(() => sessionExpiredError(request.url));
      }

      if (!refreshRequest) {
        refreshRequest = http
          .post<{ accessToken: string }>("/api/auth/refresh", { refreshToken })
          .pipe(
            map((response) => {
              if (!response.accessToken)
                throw new Error("No access token returned");
              localStorage.setItem("accessToken", response.accessToken);
              return response.accessToken;
            }),
            catchError(() => {
              session.expire();
              return throwError(() => sessionExpiredError(request.url));
            }),
            finalize(() => (refreshRequest = null)),
            shareReplay({ bufferSize: 1, refCount: false }),
          );
      }

      return refreshRequest.pipe(
        switchMap((newAccessToken) =>
          next(
            authorizedRequest.clone({
              setHeaders: { Authorization: `Bearer ${newAccessToken}` },
              context: authorizedRequest.context.set(
                RETRIED_AFTER_REFRESH,
                true,
              ),
            }),
          ),
        ),
        catchError((retryError: unknown) => {
          if (
            retryError instanceof HttpErrorResponse &&
            retryError.status === 401
          ) {
            session.expire();
            return throwError(() => sessionExpiredError(request.url));
          }
          return throwError(() => retryError);
        }),
      );
    }),
  );
};
