/**
 * Clamp a user-provided limit to the valid API range [1, 1000].
 */
export const clampLimit = (n: number): number => Math.max(1, Math.min(1000, n));
