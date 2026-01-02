import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  minify: false,
  outDir: 'dist',
  tsconfig: './tsconfig.build.json',
  onSuccess() {
    console.info('🙏 Build succeeded!');
  },
});
