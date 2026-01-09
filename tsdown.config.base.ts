import type { UserConfig, OutExtensionContext } from 'tsdown';

/**
 * tsdown config with shared defaults.
 * Package-specific options (e.g., entry, outDir, outExtensions) can be overridden by the caller.
 */
export const baseConfig = {
  entry: ['src/index.ts'],
  outDir: 'dist',
  outExtensions: (ctx) => ({
    js: isESM(ctx)
      ? '.mjs'
      : '.js',
    dts: isESM(ctx)
      ? '.d.mts'
      : '.d.ts',
  }),

  /**
   * Configures the output formats for the build.
   * - 'esm' generates ESM (ECMAScript Module) output
   * - 'cjs' generates CommonJS output
   */
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  minify: false,
  target: 'es2022',
  onSuccess() {
    console.info('🙏 Build succeeded!');
  },
  external: ['zod'],
} satisfies UserConfig

function isESM(ctx: OutExtensionContext) {
  return ctx.format === 'es'
}
