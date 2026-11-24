import {
  ComposioWebhookPayloadError,
  ComposioWebhookSignatureVerificationError,
} from '../errors/TriggerErrors';
import type { WebhookRequestLike } from '../types/triggers.types';
import { hmacSha256Base64, timingSafeEqual } from './crypto';
import { assertValidBodyLimit, readBodyWithLimit } from './readResponseBody';
import { describeThrown } from './userCallback';

const DEFAULT_WEBHOOK_BODY_LIMIT_BYTES = 10 * 1024 * 1024;

/**
 * The signature header names Composio sends with every webhook request.
 */
export const WEBHOOK_HEADERS = {
  id: 'webhook-id',
  timestamp: 'webhook-timestamp',
  signature: 'webhook-signature',
} as const;

const isFetchRequest = (request: WebhookRequestLike): request is Request =>
  typeof Request !== 'undefined' && request instanceof Request;

/**
 * Coerces an already-buffered request body into the string expected by
 * signature verification.
 */
const bodyToString = (body: unknown): string => {
  if (typeof body === 'string') {
    return body;
  }
  if (body === null || body === undefined) {
    return '';
  }
  // Already-parsed object (e.g. Next.js Pages Router with the JSON body parser).
  // Note: re-stringifying cannot reproduce the exact bytes Composio signed, so
  // signature verification on a pre-parsed body is best-effort only.
  if (typeof body === 'object') {
    return JSON.stringify(body);
  }
  return describeThrown(body);
};

const webhookBodyLimitError = (maxBytes: number): ComposioWebhookPayloadError =>
  new ComposioWebhookPayloadError(`Webhook payload exceeds the ${maxBytes}-byte limit`);

export const assertWebhookBodySize = (body: string | Uint8Array, maxBytes: number): void => {
  assertValidBodyLimit(maxBytes);
  if (
    body.length > maxBytes ||
    (typeof body === 'string' && new TextEncoder().encode(body).byteLength > maxBytes)
  ) {
    throw webhookBodyLimitError(maxBytes);
  }
};

/**
 * Reads the raw body and the headers from either request shape: a Fetch API
 * `Request`, or a plain `{ body, headers }` object.
 */
export const readWebhookRequest = async (
  request: WebhookRequestLike,
  maxBytes = DEFAULT_WEBHOOK_BODY_LIMIT_BYTES
): Promise<{ body: string; headers: unknown }> => {
  if (isFetchRequest(request)) {
    if (request.bodyUsed) {
      throw new TypeError('Webhook request body has already been read');
    }
    const bytes = await readBodyWithLimit(request, maxBytes, () => webhookBodyLimitError(maxBytes));
    return { body: new TextDecoder().decode(bytes), headers: request.headers };
  }
  const body = request.body instanceof Uint8Array ? request.body : bodyToString(request.body);
  assertWebhookBodySize(body, maxBytes);
  return {
    body: typeof body === 'string' ? body : new TextDecoder().decode(body),
    headers: request.headers,
  };
};

/**
 * Reads a single header value case-insensitively from either a `Headers`
 * instance or a plain record (where values may be `string | string[]`).
 * Returns `undefined` when the header is missing.
 */
export const getHeader = (headers: unknown, name: string): string | undefined => {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  if (headers === null || typeof headers !== 'object') {
    return undefined;
  }

  // Plain record: match the header name case-insensitively.
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== target) {
      continue;
    }
    if (Array.isArray(value)) {
      const first = value.find((item): item is string => typeof item === 'string');
      return first;
    }
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
};

/**
 * Verifies the HMAC-SHA256 signature of a webhook payload.
 * The signature format used by Composio is: `v1,base64EncodedSignature`
 * The signing input is the UTF-8 prefix `${msgId}.${timestamp}.` followed by
 * the original payload bytes.
 */
export async function verifyWebhookSignature(
  webhookId: string,
  webhookTimestamp: string,
  payload: string | Uint8Array,
  signature: string,
  secret: string
): Promise<void> {
  if (payload.length === 0) {
    throw new ComposioWebhookSignatureVerificationError('No webhook payload was provided.');
  }

  if (signature.length === 0) {
    throw new ComposioWebhookSignatureVerificationError(
      "No signature header value was provided. Please pass the value of the 'webhook-signature' header."
    );
  }

  if (secret.length === 0) {
    throw new ComposioWebhookSignatureVerificationError(
      'No webhook secret was provided. You can find your webhook secret in your Composio dashboard.'
    );
  }

  if (webhookId.length === 0) {
    throw new ComposioWebhookSignatureVerificationError(
      "No webhook ID was provided. Please pass the value of the 'webhook-id' header."
    );
  }

  if (webhookTimestamp.length === 0) {
    throw new ComposioWebhookSignatureVerificationError(
      "No webhook timestamp was provided. Please pass the value of the 'webhook-timestamp' header."
    );
  }

  // Parse signature - may have multiple signatures prefixed with version (e.g., "v1,base64sig")
  const signatures = signature.split(' ');
  const v1Signatures: string[] = [];

  for (const sig of signatures) {
    const [version, value] = sig.split(',');
    if (version === 'v1' && value) {
      v1Signatures.push(value);
    }
  }

  if (v1Signatures.length === 0) {
    throw new ComposioWebhookSignatureVerificationError(
      'No valid v1 signature found in the webhook-signature header. ' +
        "Expected format: 'v1,base64EncodedSignature'"
    );
  }

  const encoder = new TextEncoder();
  const prefix = `${webhookId}.${webhookTimestamp}.`;
  let toSign: Uint8Array<ArrayBuffer>;
  if (typeof payload === 'string') {
    toSign = encoder.encode(prefix + payload);
  } else {
    const prefixBytes = encoder.encode(prefix);
    toSign = new Uint8Array(prefixBytes.length + payload.length);
    toSign.set(prefixBytes);
    toSign.set(payload, prefixBytes.length);
  }
  const expectedSignature = await hmacSha256Base64(secret, toSign);

  if (!v1Signatures.some(candidate => timingSafeEqual(candidate, expectedSignature))) {
    throw new ComposioWebhookSignatureVerificationError(
      'The signature provided is invalid. Please ensure you are using the correct webhook secret.'
    );
  }
}

/**
 * Validates that the webhook timestamp is within the allowed tolerance
 */
export function validateWebhookTimestamp(webhookTimestamp: string, tolerance: number): void {
  const timestampSeconds = parseInt(webhookTimestamp, 10);

  if (Number.isNaN(timestampSeconds)) {
    throw new ComposioWebhookPayloadError(
      `Invalid webhook timestamp: ${webhookTimestamp}. Expected Unix timestamp in seconds.`
    );
  }

  const webhookTimeMs = timestampSeconds * 1000;
  const currentTime = Date.now();
  const timeDifference = Math.abs(currentTime - webhookTimeMs);

  if (timeDifference > tolerance * 1000) {
    throw new ComposioWebhookSignatureVerificationError(
      `The webhook timestamp is outside the allowed tolerance. ` +
        `The webhook was sent ${Math.round(timeDifference / 1000)} seconds ago, ` +
        `but the maximum allowed age is ${tolerance} seconds.`
    );
  }
}
