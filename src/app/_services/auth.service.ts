import {inject, Injectable, NgZone, signal} from '@angular/core';
import {CREDENTIALS_KEY} from "../_constants/storage-keys";
import {OdooCredentials} from "../_models/odoo/odoo-credentials.credentials";
import {StorageService} from "./storage.service";
import {OdooService} from "./odoo/odoo.service";

/**
 * Tracks whether the user is authenticated and owns the verify/store/clear flow.
 *
 * The source of truth is the `credentials` entry in `chrome.storage.local`.
 * We seed the signal from storage on startup and subscribe to
 * `chrome.storage.onChanged` so the UI reacts when login succeeds or when
 * credentials are cleared on logout.
 *
 * Login happens in the popup, so verification runs here directly against Odoo
 * rather than hopping through the background service worker.
 */
@Injectable({providedIn: 'root'})
export class AuthService {

  /** True, once verified credentials are present in local storage. */
  readonly loggedIn = signal(false);
  private readonly zone = inject(NgZone);
  private readonly storage = inject(StorageService);
  private readonly odoo = inject(OdooService);

  /**
   * Constructor reads the credentials from storage and subscribes to storage
   * changes to flip `loggedIn` when they change. {@link StorageService.onChanged}
   * already delivers updates inside Angular's zone; the initial read is wrapped
   * in `zone.run` here since it lands from a non-zone storage callback.
   */
  constructor() {
    this.storage.get<OdooCredentials>(CREDENTIALS_KEY).then(creds => {
      this.zone.run(() => this.loggedIn.set(!!creds));
    });

    this.storage.onChanged<OdooCredentials>(CREDENTIALS_KEY, creds => {
      this.loggedIn.set(!!creds);
    });
  }

  /**
   * Verifies credentials against Odoo, then persists them.
   *
   *
   *
   * @returns the user context from Odoo.
   */
  async verifyAndSaveCredentials(creds: OdooCredentials): Promise<any> {
    const context = await this.odoo.verifyCredentials(creds);
    await this.setCredentials(creds);
    return context;
  }

  /**
   * Logs the user out by removing stored credentials from local storage.
   * The storage listener flips `loggedIn` to false.
   * @return {void} This method does not return a value.
   */
  logout(): void {
    this.storage.remove(CREDENTIALS_KEY);
  }

  /**
   * Stores the provided credentials in local Chrome storage.
   *
   * @param {OdooCredentials} creds - The credentials to be saved.
   * @return {Promise<void>} A promise that resolves when the credentials have been successfully saved.
   */
  private setCredentials(creds: OdooCredentials): Promise<void> {
    return this.storage.set(CREDENTIALS_KEY, creds);
  }
}
