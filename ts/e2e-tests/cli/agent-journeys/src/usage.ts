/**
 * What a live run cost.
 *
 * Claude Code reports its own cost. The minimal loop does not, so its cost is
 * worked out from the token counts and the list prices below.
 */

export interface Usage {
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

/**
 * USD per million tokens: Anthropic list prices as of 2026-11, with cache
 * reads at 0.1x and 5-minute cache writes at 1.25x the input price. Only the
 * models a live run may call (see `model-proxy.ts`) are listed.
 */
const PRICES: Readonly<
  Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }>
> = {
  // Prompts up to 100K tokens; a journey's prompt stays well under that.
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export const ZERO_USAGE: Usage = {
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export const addTokens = (
  usage: Usage,
  model: string,
  tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number }
): Usage => {
  // A replayed model (a fixture's `hand-authored`, a rehearsal stand-in) costs nothing.
  const price = PRICES[model] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const cacheRead = tokens.cacheRead ?? 0;
  const cacheWrite = tokens.cacheWrite ?? 0;
  return {
    costUsd:
      usage.costUsd +
      (tokens.input * price.input +
        tokens.output * price.output +
        cacheRead * price.cacheRead +
        cacheWrite * price.cacheWrite) /
        1e6,
    inputTokens: usage.inputTokens + tokens.input,
    outputTokens: usage.outputTokens + tokens.output,
    cacheReadTokens: usage.cacheReadTokens + cacheRead,
    cacheWriteTokens: usage.cacheWriteTokens + cacheWrite,
  };
};
