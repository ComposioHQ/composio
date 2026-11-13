/**
 * Pass rates over repeated runs of one journey.
 *
 * With n graded runs of which c passed:
 *
 * - pass@k: the chance that at least one of k runs passes. It answers "can
 *   the agent do this at all", and rises with k.
 * - pass^k: the chance that all k runs pass. It answers "can a user rely on
 *   it", and falls with k. A skill change that makes the agent dependable
 *   moves pass^k even when pass@k is already 1.
 *
 * Both are the unbiased estimates over the n runs (Chen et al. 2021 for
 * pass@k; Yao et al. 2024, tau-bench, for pass^k), so k may be smaller than n.
 */

const choose = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return result;
};

const assertCounts = (n: number, c: number, k: number) => {
  if (!Number.isInteger(n) || !Number.isInteger(c) || !Number.isInteger(k)) {
    throw new Error(`counts must be integers (n=${n}, c=${c}, k=${k})`);
  }
  if (c < 0 || c > n || k < 1 || k > n) {
    throw new Error(`need 0 <= c <= n and 1 <= k <= n (n=${n}, c=${c}, k=${k})`);
  }
};

export const passAtK = (n: number, c: number, k: number): number => {
  assertCounts(n, c, k);
  return 1 - choose(n - c, k) / choose(n, k);
};

export const passHatK = (n: number, c: number, k: number): number => {
  assertCounts(n, c, k);
  return choose(c, k) / choose(n, k);
};

/** The 95% Wilson score interval for c successes in n runs. */
export const wilson = (c: number, n: number): { low: number; high: number } => {
  if (n === 0) return { low: 0, high: 1 };
  const z = 1.96;
  const p = c / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
};
