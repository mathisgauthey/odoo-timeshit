import {inject, Injectable, Injector} from "@angular/core";
import {MessageService} from "primeng/api";
import {AuthService} from "./auth.service";
import {OdooHttpError} from "../_models/odoo/odoo-http-error.model";

/**
 * Central handler for failed Odoo requests, wired into every authenticated call
 * via {@link OdooJson2Api}'s `onError` hook (the fetch-layer equivalent of an
 * HTTP interceptor).
 *
 * Shows a toast tailored to the HTTP status and, on 401/403, logs the user out,
 * the usual cause being an expired or revoked API key, which sends them back to
 * the login screen to re-enter it.
 */
@Injectable({providedIn: 'root'})
export class ErrorService {
  private readonly messages = inject(MessageService);
  // Resolved lazily to break the OdooService → ErrorService → AuthService → OdooService
  // DI cycle; `logout` is only ever needed at handle() time, not at construction.
  private readonly injector = inject(Injector);

  handle(error: OdooHttpError): void {
    const detail = this.detailOf(error);
    switch (error.status) {
      case 0:
        this.toast('Network error', detail ?? 'Could not reach Odoo. Check your connection.');
        break;
      case 400:
        this.toast('Bad request', detail ?? 'Odoo rejected the request.');
        break;
      case 401:
      case 403:
        this.toast('Session expired', detail ?? 'Your API key looks invalid or expired. Please sign in again.');
        this.injector.get(AuthService).logout();
        break;
      case 404:
        this.toast('Not found', detail ?? 'The requested resource no longer exists.');
        break;
      case 500:
        this.toast('Server error', detail ?? 'Odoo hit an internal error.');
        break;
      default:
        this.toast('Something went wrong', detail ?? error.message);
    }
  }

  /**
   * Extracts and returns the detailed message from an OdooHttpError instance.
   *
   * @param error The OdooHttpError object containing the error details.
   * @return A string representing the detailed error message, or undefined if no valid message is available.
   */
  private detailOf(error: OdooHttpError): string | undefined {
    const body = error.body as any;
    if (!body) return undefined;
    if (typeof body === 'string') return body;
    return body.message ?? body.error?.message ??
      (typeof body.error === 'string'
        ? body.error :
        undefined);
  }

  /**
   * Displays a toast message with severity set to 'error' and a predefined lifespan.
   *
   * @param {string} summary - The summary or title of the message to be displayed.
   * @param {string} detail - The detailed content of the message.
   * @return {void} This method does not return a value.
   */
  private toast(summary: string, detail: string): void {
    this.messages.add({severity: 'error', summary, detail, life: 5000});
  }
}
