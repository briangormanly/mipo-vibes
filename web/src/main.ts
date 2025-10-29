import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { AppComponent } from './app/app.component';
import { APP_CONFIG } from './app/app.config';

bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(withInterceptorsFromDi()), ...APP_CONFIG]
}).catch((err) => console.error(err));

