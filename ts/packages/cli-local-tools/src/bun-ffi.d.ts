declare module 'bun:ffi' {
  export const FFIType: Record<string, unknown>;
  export function dlopen(
    path: string,
    symbols: Record<string, { args: ReadonlyArray<unknown>; returns: unknown }>
  ): { symbols: Record<string, (...args: ReadonlyArray<unknown>) => unknown> };
}
