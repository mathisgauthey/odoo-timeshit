import {bootstrapApplication} from '@angular/platform-browser';
import {appConfig} from './app/app.config';
import {AppComponent} from './app/app.component';
import {environment} from './environments/environment';


/**
 * Bootstraps the Angular application.
 *
 * Behavior:
 * - In development (when environment.production is false) it dynamically
 *   imports and installs a chrome shim (to emulate chrome.storage/runtime) and
 *   loads the background listeners so chrome.runtime.onMessage works when
 *   running with `ng serve`.
 * - Always calls Angular's `bootstrapApplication` with the root component and
 *   the provided `appConfig`.
 *
 * @returns A Promise that resolves when the application has been bootstrapped.
 */
async function bootstrap() {
  if (!environment.production) {
    const {installChromeShimIfNeeded} = await import('./environments/chrome-shim');
    installChromeShimIfNeeded();
    await import('./background');
  }

  await bootstrapApplication(AppComponent, appConfig);
}

bootstrap().catch((err) => console.error(err));
