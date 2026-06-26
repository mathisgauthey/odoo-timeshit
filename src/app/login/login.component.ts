import {Component, OnDestroy, OnInit} from '@angular/core';
import {CardModule} from "primeng/card";
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators} from "@angular/forms";
import {InputTextModule} from "primeng/inputtext";
import {FloatLabelModule} from "primeng/floatlabel";
import {Button} from "primeng/button";
import {PasswordModule} from "primeng/password";
import {SelectButtonModule} from "primeng/selectbutton";
import {Subscription} from 'rxjs';
import {debounceTime} from 'rxjs/operators';
import {NgIf} from "@angular/common";
import {MessageService} from "primeng/api";
import {AuthService} from "../_services/auth.service";
import {StorageService} from "../_services/storage.service";
import {APP_VERSION} from "../_constants/app-constants";
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
  protected readonly LoginMode = LoginMode;
  private sub?: Subscription;

  constructor(private readonly fb: FormBuilder, private readonly auth: AuthService, private readonly messages: MessageService, private readonly storage: StorageService) {
    this.form = this.fb.group({
      odooBaseUrl: ['', [Validators.required]],
      odooDb: ['', [Validators.required]],
      odooUsername: ['', [Validators.required, Validators.email]],
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
    this.sub = this.form.valueChanges.pipe(debounceTime(200)).subscribe(value => {
      this.storage.set(LOGIN_FORM_DRAFT_KEY, value);
    });

    this.storage.get<typeof this.form.value>(LOGIN_FORM_DRAFT_KEY).then(draft => {
      if (draft) this.form.patchValue(draft);
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
      await this.auth.verifyAndSaveCredentials(this.form.value);
    } catch (err: any) {
      this.messages.add({
        severity: 'error',
        summary: 'Login failed',
        detail: String(err?.message ?? err)
      });
    }
  }

  /**
   * Attempts to establish a connection using a cookie-based authentication method.
   * If the base URL is not provided, marks the corresponding form field as touched.
   * Displays a warning message indicating that cookie login is not yet supported and
   * advises using API login as an alternative.
   *
   * @return {void} Does not return any value.
   */
  connectWithCookie(): void {
    const baseUrl = this.form.get('odooBaseUrl')?.value;
    if (!baseUrl) {
      this.form.get('odooBaseUrl')?.markAsTouched();
    }
    this.messages.add({
      severity: 'warn',
      summary: 'Cookie Login Not (Yet) Supported',
      detail: 'Cookie login is not yet supported. Please use the API login instead.'
    })
  }

  /**
   * Lifecycle hook that is called when the component is about to be destroyed.
   * Cleans up resources, unsubscribes from observables, and prevents memory leaks.
   *
   * @return {void} No return value.
   */
  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
