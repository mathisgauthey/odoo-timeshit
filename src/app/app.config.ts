import {ApplicationConfig} from '@angular/core';
import {provideRouter} from '@angular/router';
import {provideAnimationsAsync} from '@angular/platform-browser/animations/async';
import {ConfirmationService, MessageService} from 'primeng/api';

import {routes} from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes),
    provideAnimationsAsync(),
    MessageService, // MessageService is a singleton here so the global <p-toast> and the error handler share one toast stream.
    ConfirmationService] // ConfirmationService is shared the same way so any component can drive the single global <p-confirmDialog>.
};
