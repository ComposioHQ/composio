import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { canonicalJson, type JsonValue } from './canonical-json';
import { ChangelogCollectionSchema, type ChangelogCollection } from './collect-changelog-input';
import {
  renderChangelog,
  sha256,
  validateChangelogOutput,
  type ChangelogOutput,
  type RenderedChangelog,
} from './render-changelog';

const POLICY_URL = new URL('./openai-model-policy.json', import.meta.url);
const SCHEMA_URL = new URL('./changelog.schema.json', import.meta.url);
const PROMPT_URL = new URL(
  '../../../docs/agent-guidance/agents/sdk-release-changelog.md',
  import.meta.url
);
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/responses';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

const ModelPolicySchema = z
  .object({
    schema_version: z.literal('sdk-release-openai-model-policy/v1'),
    family: z.literal('gpt-5.5'),
    allowed_snapshots: z.array(z.literal('gpt-5.5-2026-04-23')).length(1),
    selected_snapshot: z.literal('gpt-5.5-2026-04-23'),
    endpoint: z.literal('/v1/responses'),
    reasoning_effort: z.literal('low'),
    max_output_tokens: z.number().int().min(256).max(4_000),
  })
  .strict()
  .superRefine((policy, context) => {
    if (!policy.allowed_snapshots.includes(policy.selected_snapshot)) {
      context.addIssue({
        code: 'custom',
        path: ['selected_snapshot'],
        message: 'selected model snapshot is not allowlisted',
      });
    }
  });
const UsageSchema = z
  .object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  })
  .passthrough();
const ResponsesEnvelopeSchema = z
  .object({
    id: z.string().min(1),
    status: z.string(),
    model: z.string(),
    output: z.array(z.unknown()),
    usage: UsageSchema,
  })
  .passthrough();
const OutputItemSchema = z.object({ type: z.string() }).passthrough();
const MessageSchema = z
  .object({
    type: z.literal('message'),
    role: z.literal('assistant'),
    status: z.literal('completed'),
    content: z.array(z.unknown()),
  })
  .passthrough();
const ContentItemSchema = z.object({ type: z.string() }).passthrough();
const OutputTextSchema = z
  .object({
    type: z.literal('output_text'),
    text: z.string(),
    annotations: z.array(z.never()).optional(),
  })
  .passthrough();

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

class ResponsesRequestTimeoutError extends Error {
  constructor(options?: ErrorOptions) {
    super('OpenAI Responses request timed out', options);
    this.name = 'ResponsesRequestTimeoutError';
  }
}

async function fetchWithTimeout(
  fetcher: FetchLike,
  input: string | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const timeoutController = new AbortController();
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    timeoutController.abort(new ResponsesRequestTimeoutError());
  }, timeoutMs);
  let rejectForAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectForAbort = () => reject(signal.reason);
    if (signal.aborted) {
      rejectForAbort();
    } else {
      signal.addEventListener('abort', rejectForAbort, { once: true });
    }
  });

  try {
    return await Promise.race([
      fetcher(input, {
        ...init,
        signal,
      }),
      aborted,
    ]);
  } catch (error) {
    if (timedOut) {
      throw new ResponsesRequestTimeoutError({ cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (rejectForAbort) {
      signal.removeEventListener('abort', rejectForAbort);
    }
  }
}

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const GenerationRecordSchema = z
  .object({
    generation_key: DigestSchema,
    input_sha256: DigestSchema,
    prompt_sha256: DigestSchema,
    schema_sha256: DigestSchema,
    model_policy_sha256: DigestSchema,
    output_sha256: DigestSchema,
    rendered_sha256: DigestSchema,
    prompt_version: z.literal('sdk-release-changelog-prompt/v1'),
    schema_version: z.literal('sdk-release-changelog/v1'),
    model_family: z.literal('gpt-5.5'),
    model: z.literal('gpt-5.5-2026-04-23'),
    model_sha256: DigestSchema,
    response_id: z.string().min(1),
    usage: UsageSchema.pick({
      input_tokens: true,
      output_tokens: true,
      total_tokens: true,
    }).strict(),
    generated_at: z.string().datetime({ offset: true }),
    reset_count: z.number().int().nonnegative(),
  })
  .strict();
export type GenerationRecord = z.infer<typeof GenerationRecordSchema>;

interface GenerationAssets {
  prompt: string;
  schema: JsonValue;
  policy: z.infer<typeof ModelPolicySchema>;
  prompt_sha256: string;
  schema_sha256: string;
  model_policy_sha256: string;
}

function parseJsonFile(url: URL): unknown {
  return JSON.parse(readFileSync(url, 'utf8'));
}

function loadAssets(): GenerationAssets {
  const prompt = readFileSync(PROMPT_URL, 'utf8');
  const schema = z.json().parse(parseJsonFile(SCHEMA_URL));
  const policy = ModelPolicySchema.parse(parseJsonFile(POLICY_URL));
  return {
    prompt,
    schema,
    policy,
    prompt_sha256: sha256(prompt),
    schema_sha256: sha256(canonicalJson(schema)),
    model_policy_sha256: sha256(canonicalJson(policy)),
  };
}

function generationKeyFromAssets(input: ChangelogCollection, assets: GenerationAssets): string {
  return sha256(
    canonicalJson({
      input,
      prompt_sha256: assets.prompt_sha256,
      schema_sha256: assets.schema_sha256,
      model_policy_sha256: assets.model_policy_sha256,
    })
  );
}

export function generationKey(rawInput: ChangelogCollection): string {
  const input = ChangelogCollectionSchema.parse(rawInput);
  return generationKeyFromAssets(input, loadAssets());
}

function extractOutputText(responseValue: unknown): {
  response_id: string;
  model: 'gpt-5.5-2026-04-23';
  output_text: string;
  usage: GenerationRecord['usage'];
} {
  const response = ResponsesEnvelopeSchema.parse(responseValue);
  if (response.status !== 'completed') {
    throw new Error(`OpenAI response was not completed: ${response.status}`);
  }
  if (response.model !== 'gpt-5.5-2026-04-23') {
    throw new Error(`OpenAI response model violated policy: ${response.model}`);
  }

  let message: z.infer<typeof MessageSchema> | undefined;
  for (const rawItem of response.output) {
    const item = OutputItemSchema.parse(rawItem);
    if (item.type === 'reasoning') {
      if (message) {
        throw new Error('OpenAI reasoning output must precede the output message');
      }
      continue;
    }
    if (item.type !== 'message') {
      throw new Error(`OpenAI response contained disallowed output item: ${item.type}`);
    }
    if (message) {
      throw new Error('OpenAI response contained duplicate output messages');
    }
    message = MessageSchema.parse(rawItem);
  }
  if (!message) {
    throw new Error('OpenAI response did not contain one output message');
  }
  if (message.content.length !== 1) {
    throw new Error('OpenAI response message must contain exactly one output text item');
  }
  const content = ContentItemSchema.parse(message.content[0]);
  if (content.type === 'refusal') {
    throw new Error('OpenAI response refused changelog generation');
  }
  if (content.type !== 'output_text') {
    throw new Error(`OpenAI response contained disallowed message content: ${content.type}`);
  }
  const outputText = OutputTextSchema.parse(message.content[0]);
  return {
    response_id: response.id,
    model: response.model,
    output_text: outputText.text,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      total_tokens: response.usage.total_tokens,
    },
  };
}

function parseStructuredOutput(text: string, input: ChangelogCollection): ChangelogOutput {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('OpenAI response contained invalid JSON');
  }
  return validateChangelogOutput(value, input);
}

function requestBody(input: ChangelogCollection, assets: GenerationAssets): JsonValue {
  return {
    model: assets.policy.selected_snapshot,
    store: false,
    reasoning: { effort: assets.policy.reasoning_effort },
    tools: [],
    max_output_tokens: assets.policy.max_output_tokens,
    instructions: assets.prompt,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: canonicalJson(input),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'sdk_release_changelog',
        schema: assets.schema,
        strict: true,
      },
    },
  };
}

async function requestResponse(options: {
  endpoint: string;
  apiKey: string;
  body: JsonValue;
  fetch: FetchLike;
  maxAttempts: number;
  requestTimeoutMs: number;
  signal?: AbortSignal;
  sleep: (delayMs: number) => Promise<void>;
  random: () => number;
}): Promise<unknown> {
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        options.fetch,
        options.endpoint,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: canonicalJson(options.body),
          signal: options.signal,
        },
        options.requestTimeoutMs
      );
    } catch (error) {
      const retryable = error instanceof TypeError || error instanceof ResponsesRequestTimeoutError;
      if (!retryable || attempt === options.maxAttempts) {
        throw new Error('OpenAI Responses connection failed', { cause: error });
      }
      await options.sleep(250 * 2 ** (attempt - 1) + Math.floor(options.random() * 100));
      continue;
    }

    if (response.ok) {
      try {
        return await response.json();
      } catch (error) {
        throw new Error('OpenAI Responses endpoint returned invalid JSON', { cause: error });
      }
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === options.maxAttempts) {
      throw new Error(`OpenAI Responses request failed with HTTP ${response.status}`);
    }
    await options.sleep(250 * 2 ** (attempt - 1) + Math.floor(options.random() * 100));
  }
  throw new Error('OpenAI Responses retry budget exhausted');
}

export type GenerationResult =
  | {
      action: 'generated';
      output: ChangelogOutput;
      rendered: RenderedChangelog;
      record: GenerationRecord;
      review_invalidated: boolean;
    }
  | {
      action: 'no_op' | 'preserved_human_edit' | 'manual_merge_required';
      draft: string;
      record: GenerationRecord;
      review_invalidated: false;
    };

export interface GenerateChangelogOptions {
  input: ChangelogCollection;
  apiKey?: string;
  endpoint?: string;
  fetch?: FetchLike;
  maxAttempts?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  now?: () => Date;
  existing?: {
    draft: string;
    record: GenerationRecord;
  };
  reset?: boolean;
}

export async function generateChangelog(
  options: GenerateChangelogOptions
): Promise<GenerationResult> {
  const input = ChangelogCollectionSchema.parse(options.input);
  const assets = loadAssets();
  const key = generationKeyFromAssets(input, assets);
  const existing = options.existing
    ? {
        draft: options.existing.draft,
        record: GenerationRecordSchema.parse(options.existing.record),
      }
    : undefined;
  const humanEdited =
    existing !== undefined && sha256(existing.draft) !== existing.record.rendered_sha256;

  if (existing && !options.reset) {
    if (humanEdited) {
      return {
        action:
          existing.record.generation_key === key ? 'preserved_human_edit' : 'manual_merge_required',
        draft: existing.draft,
        record: existing.record,
        review_invalidated: false,
      };
    }
    if (existing.record.generation_key === key) {
      return {
        action: 'no_op',
        draft: existing.draft,
        record: existing.record,
        review_invalidated: false,
      };
    }
  }

  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? '';
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for SDK changelog generation');
  }
  const maxAttempts = options.maxAttempts ?? 4;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new Error('maxAttempts must be an integer from 1 through 5');
  }
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
    throw new Error('requestTimeoutMs must be a positive integer');
  }
  const sleep =
    options.sleep ?? ((delayMs: number) => new Promise(resolve => setTimeout(resolve, delayMs)));
  const responseValue = await requestResponse({
    endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
    apiKey,
    body: requestBody(input, assets),
    fetch: options.fetch ?? fetch,
    maxAttempts,
    requestTimeoutMs,
    signal: options.signal,
    sleep,
    random: options.random ?? Math.random,
  });
  const response = extractOutputText(responseValue);
  const output = parseStructuredOutput(response.output_text, input);
  const rendered = renderChangelog(input, output);
  const canonicalOutput = canonicalJson(output);
  const inputBytes = canonicalJson(input);
  const record = GenerationRecordSchema.parse({
    generation_key: key,
    input_sha256: sha256(inputBytes),
    prompt_sha256: assets.prompt_sha256,
    schema_sha256: assets.schema_sha256,
    model_policy_sha256: assets.model_policy_sha256,
    output_sha256: createHash('sha256').update(canonicalOutput, 'utf8').digest('hex'),
    rendered_sha256: rendered.sha256,
    prompt_version: 'sdk-release-changelog-prompt/v1',
    schema_version: 'sdk-release-changelog/v1',
    model_family: assets.policy.family,
    model: response.model,
    model_sha256: sha256(response.model),
    response_id: response.response_id,
    usage: response.usage,
    generated_at: (options.now ?? (() => new Date()))().toISOString(),
    reset_count: (existing?.record.reset_count ?? 0) + (options.reset ? 1 : 0),
  });
  return {
    action: 'generated',
    output,
    rendered,
    record,
    review_invalidated: Boolean(existing && options.reset),
  };
}
