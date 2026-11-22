import { z } from 'zod/v3';

// =============================================================================
// SESSION WEBHOOK EVENTS
//
// What Composio sends to a project's session webhook URL for a session hook
// with a `webhook` handler, and what the endpoint answers with. Both keep the
// field names of the webhook reference (snake_case): the endpoint reads the
// event and writes its answer as plain JSON, so one spelling serves both.
//
// Every schema uses .passthrough() to accept fields the API may add later.
// =============================================================================

export const SessionWebhookEventTypes = {
  BEFORE_EXECUTE: 'composio.session_hook.before_execute',
  AFTER_EXECUTE: 'composio.session_hook.after_execute',
} as const;

export type SessionWebhookEventType =
  (typeof SessionWebhookEventTypes)[keyof typeof SessionWebhookEventTypes];

const SessionWebhookMetadataSchema = z
  .object({
    /** ID of the project */
    project_id: z.string(),
    /** ID of the session the call was made in */
    session_id: z.string(),
    /** ID of the user the session belongs to */
    user_id: z.string(),
    /** ID of the hook that sent this event, as set on the session */
    hook_id: z.string(),
  })
  .passthrough();

/** Where an event came from. `hook_id` is the hook's id on the session. */
export type SessionWebhookMetadata = z.infer<typeof SessionWebhookMetadataSchema>;

const SessionWebhookToolCallSchema = z
  .object({
    /** Slug of the toolkit (for example `gmail`) */
    toolkit_slug: z.string(),
    /** Slug of the tool (for example `GMAIL_SEND_EMAIL`) */
    tool_slug: z.string(),
    /** Version of the toolkit the tool runs from */
    toolkit_version: z.string(),
    /** ID of the connected account the call uses. Omitted when the call doesn't use one. */
    connected_account_id: z.string().optional(),
    /** The arguments the tool is called with */
    arguments: z.record(z.unknown()),
  })
  .passthrough();

/** A tool call. */
export type SessionWebhookToolCall = z.infer<typeof SessionWebhookToolCallSchema>;

const SessionWebhookToolResponseSchema = z
  .object({
    /** The data the tool returned */
    data: z.record(z.unknown()),
    /** Error message when the tool failed, otherwise null */
    error: z.string().nullable(),
  })
  .passthrough();

/** What a tool call returned. */
export type SessionWebhookToolResponse = z.infer<typeof SessionWebhookToolResponseSchema>;

const SessionWebhookHttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']);

const SessionWebhookHttpParameterSchema = z
  .object({
    /** Header or query parameter name */
    name: z.string(),
    /** Header or query parameter value */
    value: z.string(),
    /** Whether the parameter is a header or a query parameter */
    type: z.enum(['header', 'query']),
  })
  .passthrough();

const SessionWebhookHttpRequestSchema = z
  .object({
    /** Slug of the toolkit whose API is called (for example `github`) */
    toolkit_slug: z.string(),
    /** ID of the connected account the call uses. Omitted when the call doesn't use one. */
    connected_account_id: z.string().optional(),
    method: SessionWebhookHttpMethodSchema,
    /** The endpoint as the agent gave it: a path relative to the toolkit's API base URL, or a full URL */
    endpoint: z.string(),
    /** Headers and query parameters the agent added. The credentials Composio adds are not included. */
    parameters: z.array(SessionWebhookHttpParameterSchema),
    /** The request body. Omitted when there is none or when it is binary. */
    body: z.unknown().optional(),
  })
  .passthrough();

/** A proxy call: an HTTP request to a toolkit's API. */
export type SessionWebhookHttpRequest = z.infer<typeof SessionWebhookHttpRequestSchema>;

const SessionWebhookHttpResponseSchema = z
  .object({
    /** HTTP status the app's API returned */
    status: z.number(),
    /** Headers the app's API returned. Credential values Composio added are redacted. */
    headers: z.record(z.string()),
    /** Response body the app's API returned. Omitted when it is binary. */
    data: z.unknown().optional(),
    /** The file the API returned, as a temporary download link. Present when the response is binary. */
    binary_data: z
      .object({
        url: z.string(),
        content_type: z.string(),
        size: z.number(),
        expires_at: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** What a proxy call returned. */
export type SessionWebhookHttpResponse = z.infer<typeof SessionWebhookHttpResponseSchema>;

const sessionWebhookEnvelopeFields = {
  /** Unique event ID (`msg_<uuid>`). Also sent as the `webhook-id` header. */
  id: z.string(),
  /** ISO-8601 timestamp of when the event was created */
  timestamp: z.string(),
  metadata: SessionWebhookMetadataSchema,
};

/**
 * Sent before a call runs. `data.type` says whether it is a tool call
 * (`tool_call`) or a proxy call (`http_request`).
 */
export const SessionWebhookBeforeExecuteEventSchema = z
  .object({
    ...sessionWebhookEnvelopeFields,
    type: z.literal(SessionWebhookEventTypes.BEFORE_EXECUTE),
    data: z.discriminatedUnion('type', [
      z
        .object({ type: z.literal('tool_execute'), tool_call: SessionWebhookToolCallSchema })
        .passthrough(),
      z
        .object({ type: z.literal('proxy_execute'), http_request: SessionWebhookHttpRequestSchema })
        .passthrough(),
    ]),
  })
  .passthrough();

export type SessionWebhookBeforeExecuteEvent = z.infer<
  typeof SessionWebhookBeforeExecuteEventSchema
>;

/**
 * Sent after a call ran, with what it returned: `tool_response` for a tool
 * call, `http_response` for a proxy call.
 */
export const SessionWebhookAfterExecuteEventSchema = z
  .object({
    ...sessionWebhookEnvelopeFields,
    type: z.literal(SessionWebhookEventTypes.AFTER_EXECUTE),
    data: z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('tool_execute'),
          tool_call: SessionWebhookToolCallSchema,
          tool_response: SessionWebhookToolResponseSchema,
        })
        .passthrough(),
      z
        .object({
          type: z.literal('proxy_execute'),
          http_request: SessionWebhookHttpRequestSchema,
          http_response: SessionWebhookHttpResponseSchema,
        })
        .passthrough(),
    ]),
  })
  .passthrough();

export type SessionWebhookAfterExecuteEvent = z.infer<typeof SessionWebhookAfterExecuteEventSchema>;

/**
 * An event Composio sends to the session webhook URL, as returned by
 * `composio.sessions.webhooks.parse()`.
 */
export const SessionWebhookEventSchema = z.discriminatedUnion('type', [
  SessionWebhookBeforeExecuteEventSchema,
  SessionWebhookAfterExecuteEventSchema,
]);

export type SessionWebhookEvent = z.infer<typeof SessionWebhookEventSchema>;

/**
 * Options for `composio.sessions.webhooks.parse()`.
 */
export type ParseSessionWebhookOptions = {
  /**
   * The project's session webhook secret, shown once in the dashboard when the
   * session webhook URL is saved or its secret is rotated. Required: the
   * request signature is always verified.
   */
  verifySecret: string;
  /**
   * Maximum allowed age of the event in seconds (default: 300 = 5 minutes).
   * Set to 0 to disable timestamp validation.
   */
  tolerance?: number;
};

// =============================================================================
// ANSWERS: what the endpoint sends back, with HTTP status 200
//
// Composio rejects an answer with a field it doesn't know, except on a block,
// and then applies the hook's `fallback_action`. Type the answer with these so
// a misspelled field is caught at compile time.
// =============================================================================

/** Stops the call. `message` is shown to the agent. */
export type SessionWebhookBlockResponse = {
  action: 'block';
  message: string;
};

/**
 * Fields of a proxy request to replace. Fields left out keep their original
 * value. The toolkit cannot be changed.
 */
export type SessionWebhookHttpRequestOverride = {
  method?: z.infer<typeof SessionWebhookHttpMethodSchema>;
  endpoint?: string;
  parameters?: Array<{ name: string; value: string; type: 'header' | 'query' }>;
  body?: unknown;
};

/**
 * Fields of a proxy response to replace. Fields left out keep their original
 * value. The status and a binary file cannot be changed.
 */
export type SessionWebhookHttpResponseOverride = {
  data?: unknown;
  /** Replaces the API's headers in full */
  headers?: Record<string, string>;
};

/**
 * The answer to a `before_execute` event: let the call run, run it with
 * changes, or block it. Use `tool_call` to change a tool call and
 * `http_request` to change a proxy call.
 */
export type SessionWebhookBeforeExecuteResponse =
  | {
      action: 'continue';
      override?:
        | { tool_call: { arguments: Record<string, unknown> } }
        | { http_request: SessionWebhookHttpRequestOverride }
        | null;
    }
  | SessionWebhookBlockResponse;

/**
 * The answer to an `after_execute` event: pass the result on to the agent,
 * pass on a changed result, or block it. Use `tool_response` to change a tool
 * call's result and `http_response` to change a proxy call's.
 */
export type SessionWebhookAfterExecuteResponse =
  | {
      action: 'continue';
      override?:
        | { tool_response: { data: Record<string, unknown> } }
        | { http_response: SessionWebhookHttpResponseOverride }
        | null;
    }
  | SessionWebhookBlockResponse;
