/**
 * A failed Odoo request. `status` is the HTTP status code, or `0` for a network
 * failure (request never reached the server). `body` is the parsed error payload
 * when one was returned.
 */
export class OdooHttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body?: unknown,
  ) {
    super(`Odoo request failed: ${status} ${statusText}`);
    this.name = 'OdooHttpError';
  }
}
