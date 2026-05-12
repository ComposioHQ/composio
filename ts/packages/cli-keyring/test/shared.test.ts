import { describe, it, expect } from 'vitest';
import { encodeSecret, decodeSecret } from '../src/stores/shared';

describe('shared encoding', () => {
  it('roundtrips arbitrary bytes through base64 with the b64: prefix', () => {
    const inputs: Uint8Array[] = [
      new Uint8Array(),
      new Uint8Array([0]),
      new Uint8Array([1, 2, 3, 4, 5]),
      new Uint8Array([0xff, 0xfe, 0xfd]),
      new Uint8Array(Buffer.from('plain string', 'utf8')),
      new Uint8Array(Buffer.from('password with spaces\nand newline', 'utf8')),
      // 1 KiB of pseudo-random data
      crypto.getRandomValues(new Uint8Array(1024)),
    ];
    for (const bytes of inputs) {
      const encoded = encodeSecret(bytes);
      expect(encoded.startsWith('b64:')).toBe(true);
      const decoded = decodeSecret(encoded);
      expect(Array.from(decoded)).toEqual(Array.from(bytes));
    }
  });

  it('tolerates a trailing newline from CLI stdout', () => {
    const encoded = encodeSecret(new Uint8Array([1, 2, 3]));
    expect(Array.from(decodeSecret(encoded + '\n'))).toEqual([1, 2, 3]);
  });

  it('rejects blobs without the b64: prefix', () => {
    expect(() => decodeSecret('no-prefix-here')).toThrowError();
  });

  it('rejects blobs with non-base64 characters after the prefix', () => {
    expect(() => decodeSecret('b64:!!!not-base64!!!')).toThrowError();
  });
});
