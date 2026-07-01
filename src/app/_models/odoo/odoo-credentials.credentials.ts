import {LoginMode} from "../login-mode";

/** Credentials entered on the login form and, once verified, persisted to storage. */
export interface OdooCredentials {
  odooBaseUrl: string;
  /** How requests authenticate against Odoo. Defaults to {@link LoginMode.API}. */
  loginMode: LoginMode;
  /** Bearer token, required for {@link LoginMode.API}; unused for cookie login. */
  apiKey?: string;
}
