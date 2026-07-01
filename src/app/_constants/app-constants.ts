export const APP_TITLE = 'odoo-timeshit'

/**
 * Extension version, inlined from package.json at build time (see
 * custom-webpack.config.ts). Falls back to a dev marker when the DefinePlugin
 * isn't applied (e.g. `ng serve`, unit tests).
 */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'undefined' ? 'unknown version' : __APP_VERSION__

/** Public repository, used as the documentation link across the app. */
export const REPO_URL = 'https://github.com/mathisgauthey/odoo-timeshit'
export const DOC_URL = REPO_URL
export const BUG_REPORT_URL = `${REPO_URL}/issues/new?template=bug_report.md`
export const FEATURE_REQUEST_URL = `${REPO_URL}/issues/new?template=feature_request.md`
