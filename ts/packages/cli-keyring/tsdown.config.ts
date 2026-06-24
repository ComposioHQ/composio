import { defineConfig } from 'tsdown';
import { baseConfig } from '../../../tsdown.config.base.ts';

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts', 'src/effect.ts'],
  tsconfig: 'tsconfig.src.json',
  // bun:ffi is a Bun built-in. Keep it external so Node never tries to
  // load the FFI backend chunk at startup; stores/macos-security.ts
  // guards `isBun` before reaching the dynamic import.
  external: [...baseConfig.external, /^bun:/],
});
