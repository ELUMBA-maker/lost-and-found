import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { App } from "./app/app";
import { authRefreshInterceptor } from "./app/core/auth-refresh.interceptor";

bootstrapApplication(App, {
  providers: [provideHttpClient(withInterceptors([authRefreshInterceptor]))],
}).catch((error) => console.error(error));
