/**
 * Injected at build time by webpack's DefinePlugin from `package.json`
 * (see custom-webpack.config.ts). Absent under builders that don't run the
 * custom webpack config (e.g. `ng serve`, karma), hence the `typeof` guard
 * wherever it's read.
 */
declare const __APP_VERSION__: string;
