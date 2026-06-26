import type {Configuration} from 'webpack';

/**
 * Webpack configuration for the browser extension build.
 *
 * - Builds two self-contained entries: `background` and `content` (each inlines
 *   its runtime via `runtime: false`).
 * - Prevents splitting shared modules into async chunks for those two entries
 *   because extension contexts (content/background scripts) cannot load
 *   additional async chunks at runtime.
 */
module.exports = {
  entry: {
    background: {import: 'src/background.ts', runtime: false},
    content: {import: 'src/content.ts', runtime: false},
  },
  optimization: {
    splitChunks: {
      chunks(chunk: { name?: string }) {
        return chunk.name !== 'background' && chunk.name !== 'content';
      },
    },
  },
  // output: {
  //   devtoolModuleFilenameTemplate: (info: any) =>
  //     `file:///${info.absoluteResourcePath.replace(/\\/g, '/')}`,
  // }, This changes the sources from webpack:///./src/background.ts to file:///PATH/.../src/background.ts, which maps automatically. With this, the webpack:///. mapping becomes unnecessary (harmless to leave, though).
} as Configuration;
