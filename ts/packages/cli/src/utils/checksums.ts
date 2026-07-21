/**
 * Parse a sha256sum-compatible `checksums.txt` ("<hash>  <filename>" per line)
 * into a filename -> expected-hash map. Blank lines are skipped.
 */
export const parseChecksumsText = (text: string): Map<string, string> => {
  const checksums = new Map<string, string>();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      checksums.set(parts[1]!, parts[0]!);
    }
  }
  return checksums;
};

/**
 * SHA-256 digest of `data` as a lowercase hex string. Copies into a fresh
 * ArrayBuffer so views over a SharedArrayBuffer are accepted too.
 */
export const sha256Hex = async (data: Uint8Array): Promise<string> => {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};
