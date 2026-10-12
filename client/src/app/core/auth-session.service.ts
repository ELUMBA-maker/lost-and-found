import { Injectable } from "@angular/core";
import { Subject } from "rxjs";

@Injectable({ providedIn: "root" })
export class AuthSessionService {
  private readonly expiredSubject = new Subject<void>();
  readonly expired$ = this.expiredSubject.asObservable();

  expire(): void {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("authUser");
    this.expiredSubject.next();
  }
}
