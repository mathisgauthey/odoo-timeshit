/**
 * Promise wrapper over `chrome.cookies`, used by cookie login to detect an
 * existing Odoo browser session. Reading the cookie requires the `cookies`
 * permission plus a host permission for the target URL (the manifest grants
 * `<all_urls>`).
 *
 * No-ops gracefully when `chrome.cookies` is absent (e.g. a unit test that
 * never installed the dev shim), resolving to `null`.
 */

/** Name of the Odoo session cookie set by a logged-in web session. */
export const SESSION_COOKIE_NAME = 'session_id';

/**
 * Coerces user-typed input into a URL `chrome.cookies.get` accepts, defaulting
 * to `https://` when no scheme is present. Returns `null` when the input can't
 * be parsed into a URL at all.
 */
function toCookieUrl(input: string): string | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

/**
 * Resolves the value of the Odoo `session_id` cookie for the given base URL, or
 * `null` when no session cookie exists (or the URL/`chrome.cookies` is unusable).
 */
export function getSessionCookie(baseUrl: string): Promise<string | null> {
  const chrome = (globalThis as any).chrome;
  const url = toCookieUrl(baseUrl);
  if (!chrome?.cookies || !url) return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      chrome.cookies.get({url, name: SESSION_COOKIE_NAME}, (cookie: any) => {
        resolve(cookie?.value ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}
