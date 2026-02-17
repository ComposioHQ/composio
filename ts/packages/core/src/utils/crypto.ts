import { arrayBufferToBase64 } from './buffer';

/**
 * Computes HMAC-SHA256 using Web Crypto API
 */
export async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureData = encoder.encode(message);
  const signatureBuffer = await globalThis.crypto.subtle.sign('HMAC', key, signatureData);

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
