import { arrayBufferToBase64 } from './buffer';

/**
 * Computes HMAC-SHA256 using Web Crypto API
 */
export async function hmacSha256Base64(
  secret: string,
  message: Uint8Array<ArrayBuffer>
): Promise<string> {
  const keyData = new TextEncoder().encode(secret);
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await globalThis.crypto.subtle.sign('HMAC', key, message);

  return arrayBufferToBase64(signatureBuffer);
}

/**
 * Constant-time comparison of two strings to prevent timing attacks
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
