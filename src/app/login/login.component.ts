import {Component, OnDestroy, OnInit, signal} from '@angular/core';
import {CardModule} from "primeng/card";
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators} from "@angular/forms";
import {InputTextModule} from "primeng/inputtext";
import {FloatLabelModule} from "primeng/floatlabel";
import {Button} from "primeng/button";
import {PasswordModule} from "primeng/password";
import {SelectButtonModule} from "primeng/selectbutton";
import {Subscription} from 'rxjs';
import {debounceTime, distinctUntilChanged} from 'rxjs/operators';
import {NgIf} from "@angular/common";
import {MessageService} from "primeng/api";
import {AuthService} from "../_services/auth.service";
import {StorageService} from "../_services/storage.service";
import {APP_VERSION, DOC_URL} from "../_constants/app-constants";
import {LOGIN_FORM_DRAFT_KEY} from "../_constants/storage-keys";
import {LoginMode} from "../_models/login-mode";

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CardModule,
    FormsModule,
    ReactiveFormsModule,
    InputTextModule,
    FloatLabelModule,
    Button,
    PasswordModule,
    SelectButtonModule,
    NgIf,
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, OnDestroy {
  form: FormGroup;
  loginMode: LoginMode = LoginMode.API;
  readonly loginModes = [
    {label: 'API Login', value: LoginMode.API},
    {label: 'Cookie Login', value: LoginMode.Cookie}
  ];
  protected readonly APP_VERSION = APP_VERSION;
  protected readonly DOC_URL = DOC_URL;
  protected readonly LoginMode = LoginMode;
  /** True once a live Odoo `session_id` cookie is found for the typed base URL. */
  readonly cookieDetected = signal(false);
  private readonly subs: Subscription[] = [];

  constructor(private readonly fb: FormBuilder, private readonly auth: AuthService, private readonly messages: MessageService, private readonly storage: StorageService) {
    this.form = this.fb.group({
      odooBaseUrl: ['', [Validators.required]],
      apiKey: ['', [Validators.required]]
    });
  }

  /**
   * Lifecycle hook that is called after Angular has initialized all data-bound properties.
   *
   * This method subscribes to the value changes of a reactive form and debounces the updates
   * before storing the form data into the browser's local storage. It also retrieves any previously
   * stored form data from local storage and applies it to the form upon initialization.
   *
   * @return {void} No return value.
   */
  ngOnInit(): void {
    this.subs.push(this.form.valueChanges.pipe(debounceTime(200)).subscribe(value => {
      this.storage.set(LOGIN_FORM_DRAFT_KEY, value);
    }));

    // Probe for an existing Odoo session cookie whenever the base URL settles,
    // so the cookie login tab can advertise itself as available.
    const baseUrl = this.form.get('odooBaseUrl')!;
    this.subs.push(baseUrl.valueChanges.pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(url => this.refreshCookieDetection(url)));

    this.storage.get<typeof this.form.value>(LOGIN_FORM_DRAFT_KEY).then(draft => {
      if (draft) this.form.patchValue(draft);
      this.refreshCookieDetection(this.form.get('odooBaseUrl')?.value);
    });
  }

  /**
   * Authenticates and connects the user using an API key provided in the form.
   * Validates the form and, if valid, verifies and saves the credentials.
   * Displays an error message if the authentication process fails.
   *
   * @return {Promise<void>} A Promise that resolves when the connection process completes.
   */
  async connectWithApiKey(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    try {
      await this.auth.verifyAndSaveCredentials({...this.form.value, loginMode: LoginMode.API});
    } catch (err: any) {
      this.messages.add({
        severity: 'error',
        summary: 'Login failed',
        detail: String(err?.message ?? err)
      });
    }
  }

  /**
   * Establishes a connection using the browser's Odoo session cookie. Verifies
   * that the session is still valid (by fetching the user context through the
   * cookie transport) before persisting the credentials. Requires a base URL
   * and a detected session cookie; otherwise it nudges the user accordingly.
   *
   * @return {Promise<void>} A Promise that resolves when the connection process completes.
   */
  async connectWithCookie(): Promise<void> {
    const odooBaseUrl = this.form.get('odooBaseUrl')?.value?.trim();
    if (!odooBaseUrl) {
      this.form.get('odooBaseUrl')?.markAsTouched();
      return;
    }
    if (!this.cookieDetected()) {
      this.messages.add({
        severity: 'warn',
        summary: 'No Odoo Session Found',
        detail: 'Log into Odoo in another tab for this URL, then try again.'
      });
      return;
    }

    try {
      await this.auth.verifyAndSaveCredentials({odooBaseUrl, loginMode: LoginMode.Cookie});
    } catch (err: any) {
      this.messages.add({
        severity: 'error',
        summary: 'Login failed',
        detail: String(err?.message ?? err)
      });
    }
  }

  /**
   * Lifecycle hook that is called when the component is about to be destroyed.
   * Cleans up resources, unsubscribes from observables, and prevents memory leaks.
   *
   * @return {void} No return value.
   */
  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  /**
   * Updates {@link cookieDetected} for the given base URL. Blank input short-
   * circuits to `false` without touching `chrome.cookies`.
   *
   * @param baseUrl - The base URL currently entered on the form.
   */
  private async refreshCookieDetection(baseUrl: string | null | undefined): Promise<void> {
    if (!baseUrl?.trim()) {
      this.cookieDetected.set(false);
      return;
    }
    this.cookieDetected.set(await this.auth.hasSessionCookie(baseUrl));
  }
}
