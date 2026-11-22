/**
 * @fileoverview The `composio.sessions.webhooks` namespace: reading the events
 * Composio sends to a project's session webhook URL.
 *
 * @module SessionWebhooks
 */
import { ValidationError } from '../errors/ValidationErrors';
import { ComposioWebhookPayloadError } from '../errors/TriggerErrors';
import { telemetry } from '../telemetry/Telemetry';
import {
  ParseSessionWebhookParams,
  SessionWebhookEvent,
  SessionWebhookEventSchema,
  SessionWebhookEventTypes,
} from '../types/sessionWebhooks.types';
import {
  WEBHOOK_HEADERS,
  getHeader,
  validateWebhookTimestamp,
  verifyWebhookSignature,
} from '../utils/webhookVerification';

const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * `composio.sessions.webhooks` — for the endpoint at a project's session
 * webhook URL, which answers session hooks that have a `webhook` handler.
 */
export class SessionWebhooks {
  constructor() {
    telemetry.instrument(this, 'SessionWebhooks');
  }

  /**
   * Verify and parse an event Composio sent to the session webhook URL.
   *
   * Composio sends one before or after each tool or proxy call that a hook
   * with a `webhook` handler applies to, and waits for the endpoint's answer.
   * The signature is always verified, with the project's session webhook
   * secret. The event is returned as Composio sent it, with the field names of
   * the webhook reference.
   *
   * Pass the raw, unparsed request body: the signature covers its exact bytes.
   *
   * @param {ParseSessionWebhookParams} params - The request and how to verify it
   * @param {string | Uint8Array} params.body - The raw request body
   * @param {Headers | Record<string, string | string[] | undefined>} params.headers - The request headers
   * @param {string} params.verifySecret - The project's session webhook secret
   * @param {number} [params.tolerance=300] - Max event age in seconds. Set to 0 to disable the check.
   * @returns {Promise<SessionWebhookEvent>} The verified event
   *
   * @throws {ValidationError} If `verifySecret` is empty or the signature headers are missing
   * @throws {ComposioWebhookSignatureVerificationError} If signature verification fails
   * @throws {ComposioWebhookPayloadError} If the body is not a session webhook event
   *
   * @example
   * ```ts
   * // Next.js App Router, at the project's session webhook URL
   * export async function POST(request: Request) {
   *   const hook = await composio.sessions.webhooks.parse({
   *     body: await request.text(),
   *     headers: request.headers,
   *     verifySecret: process.env.COMPOSIO_SESSION_WEBHOOK_SECRET!,
   *   });
   *
   *   // Keep a confidential project out of every call and every result
   *   if (JSON.stringify(hook.data).includes('Project Titan')) {
   *     return Response.json({ action: 'block', message: 'Project Titan is confidential' });
   *   }
   *   return Response.json({ action: 'continue' });
   * }
   * ```
   */
  async parse(params: ParseSessionWebhookParams): Promise<SessionWebhookEvent> {
    const { headers, verifySecret: secret } = params;
    const body =
      typeof params.body === 'string' ? params.body : new TextDecoder().decode(params.body);

    if (!secret) {
      throw new ValidationError(
        `Cannot verify session webhook: 'verifySecret' is empty — your ` +
          `COMPOSIO_SESSION_WEBHOOK_SECRET is likely unset. Set it to the project's ` +
          `session webhook secret from the Composio dashboard.`
      );
    }

    const id = getHeader(headers, WEBHOOK_HEADERS.id);
    const timestamp = getHeader(headers, WEBHOOK_HEADERS.timestamp);
    const signature = getHeader(headers, WEBHOOK_HEADERS.signature);

    if (!id || !timestamp || !signature) {
      const missing = [
        !id ? `'${WEBHOOK_HEADERS.id}'` : undefined,
        !timestamp ? `'${WEBHOOK_HEADERS.timestamp}'` : undefined,
        !signature ? `'${WEBHOOK_HEADERS.signature}'` : undefined,
      ].filter((header): header is string => header !== undefined);

      throw new ValidationError(
        `Cannot verify session webhook: missing signature header(s) ${missing.join(', ')}. ` +
          `Pass the raw, unparsed request body and ensure the Composio signature headers ` +
          `(${WEBHOOK_HEADERS.id}, ${WEBHOOK_HEADERS.timestamp}, ${WEBHOOK_HEADERS.signature}) ` +
          `are forwarded to sessions.webhooks.parse().`
      );
    }

    const tolerance = params.tolerance ?? DEFAULT_TOLERANCE_SECONDS;
    if (tolerance > 0) {
      validateWebhookTimestamp(timestamp, tolerance);
    }
    await verifyWebhookSignature(id, timestamp, body, signature, secret);

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch (error) {
      throw new ComposioWebhookPayloadError('Failed to parse session webhook payload as JSON', {
        cause: error,
      });
    }

    const event = SessionWebhookEventSchema.safeParse(json);
    if (!event.success) {
      // Name the fields, never their values: the event carries the call's data.
      const fields = [...new Set(event.error.issues.map(issue => issue.path.join('.')))].sort();
      const isAnotherPayload = fields.includes('') || fields.includes('type');
      throw new ComposioWebhookPayloadError(
        isAnotherPayload
          ? `Payload is not a session webhook event. Expected a '${SessionWebhookEventTypes.BEFORE_EXECUTE}' ` +
              `or '${SessionWebhookEventTypes.AFTER_EXECUTE}' event.`
          : `Session webhook event has missing or invalid fields: ${fields.join(', ')}`
      );
    }
    return event.data;
  }
}
