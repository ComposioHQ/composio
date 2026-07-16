/**
 * djb2 string hash (seed 5381, xor variant), normalized to a non-negative
 * 32-bit integer. Callers pick their own string encoding (hex, base36, ...).
 */
export const djb2Hash = (value: string): number => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return Math.abs(hash >>> 0);
};
