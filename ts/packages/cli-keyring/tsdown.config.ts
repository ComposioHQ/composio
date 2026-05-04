import { defineConfig } from 'tsdown';
import { baseConfig } from '../../../tsdown.config.base';

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts', 'src/effect.ts'],
  tsconfig: 'tsconfig.src.json',
  // bun:ffi is a Bun built-in; in the Node/CJS output it must remain
  // an unresolved import so Node never tries to load the FFI backend
  // chunk at startup. The runtime branch in stores/macos-security.ts
  // guards `isBun` before reaching the dynamic import.
  external: [...baseConfig.external, /^bun:/],
});
