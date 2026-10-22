import { ComposioError, type Tool, type ToolExecuteParams } from '@composio/core';
import { z } from 'zod/v3';

// ---------------------------------------------------------------------------
// TypeSafe client boundary
// ---------------------------------------------------------------------------

/** A JSON-compatible value. */
export type TypesafeJsonValue =
  string | number | boolean | null | TypesafeJsonValue[] | { [key: string]: TypesafeJsonValue };

/** A yes/no question. */
export interface TypesafeNoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: { true?: string; false?: string };
}

/** A question that selects one option key. */
export interface TypesafeChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}

export type TypesafeQuestion = TypesafeNoulQuestion | TypesafeChoiceQuestion;

export interface TypesafeSystemOneRequest {
  state: TypesafeJsonValue;
  questions: Record<string, TypesafeQuestion>;
  model?: string;
}

export interface TypesafeRequestOptions {
  signal?: AbortSignal;
  timeout?: number;
}

/**
 * The part of `TypeSafeClient` from `@typesafe-ai/sdk` that the provider uses.
 * An injected client only has to satisfy this shape.
 */
export interface TypesafeClientLike {
  systemOne(
    request: TypesafeSystemOneRequest,
    options?: TypesafeRequestOptions
  ): PromiseLike<unknown> & {
    withResponse?: () => Promise<{ data: unknown; requestId?: string | undefined }>;
  };
}

// ---------------------------------------------------------------------------
// Compiled tools
// ---------------------------------------------------------------------------

/** Risk class derived from Composio's tool tags. */
export type TypesafeRisk = 'read_only' | 'mutating' | 'destructive';

/** A closed-set value Jev can bind. */
export type TypesafeOptionValue = string | number | boolean | null;

/** One option of a compiled Choice. `key` is what Jev sees; `value` is what the tool receives. */
export interface TypesafeOption {
  key: string;
  value: TypesafeOptionValue;
}

/** An enum or boolean argument, asked as one Choice with a not-stated option. */
export interface TypesafeChoiceArgument {
  kind: 'choice';
  name: string;
  required: boolean;
  questionId: string;
  question: TypesafeChoiceQuestion;
  options: TypesafeOption[];
  notStatedKey: string;
}

/** An array-of-enum argument, asked as one "mentioned" Noul plus one Noul per member. */
export interface TypesafeArrayArgument {
  kind: 'array';
  name: string;
  required: boolean;
  mentionedId: string;
  mentioned: TypesafeNoulQuestion;
  members: Array<{ questionId: string; value: string | number; question: TypesafeNoulQuestion }>;
  maxItems?: number;
  /** A selection with fewer members than this is not stated, so the argument stays missing. */
  minItems?: number;
}

export type TypesafeArgumentQuestion = TypesafeChoiceArgument | TypesafeArrayArgument;

/** A Composio tool compiled into Jev questions. Plain JSON. */
export interface TypesafeToolQuestions {
  slug: string;
  name: string;
  /** The text of this tool's option in the routing Choice. */
  routingDescription: string;
  version?: string;
  risk: TypesafeRisk;
  /** One entry per closed-set argument, sorted by argument name. */
  arguments: TypesafeArgumentQuestion[];
  /** Open-ended argument names. Jev never writes these. */
  openEnded: string[];
  /** Required argument names. */
  required: string[];
}

/** What `composio.tools.get()` returns with this provider. Plain JSON. */
export interface TypesafeToolSet {
  tools: TypesafeToolQuestions[];
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface TypesafeThresholds {
  /** Minimum routing confidence. Default 0.6, and 0.9 for a destructive tool. */
  routing: number;
  /** Minimum mean of the "is an action requested" Nouls. Default 0.3. */
  gate: number;
  /** Minimum confidence to bind an argument. Default 0.6. */
  argument: number;
}

export type TypesafeContextScope = 'arguments' | 'all';

export interface TypesafeProviderOptions {
  /** A client to use instead of building one. Its logging is the caller's responsibility. */
  client?: TypesafeClientLike;
  /** Defaults to `TYPESAFE_API_KEY`. Ignored when `client` is set. */
  apiKey?: string;
  /** Defaults to `jev-latest`. */
  model?: string;
  thresholds?: Partial<TypesafeThresholds>;
  /** `arguments` (default) keeps `context` away from routing and the action gate. */
  contextScope?: TypesafeContextScope;
}

/** A plain request, or a request with supporting context. */
export type TypesafeState = string | { request: string; context?: TypesafeJsonValue };

export interface TypesafeDecideOptions extends TypesafeRequestOptions {
  /** Values the caller already knows. They get no question and do not affect confidence. */
  arguments?: Record<string, unknown>;
  thresholds?: Partial<TypesafeThresholds>;
  contextScope?: TypesafeContextScope;
  model?: string;
}

export interface TypesafeExecuteInput {
  /** Caller arguments. They win over Jev-bound values. Only `undefined` counts as missing. */
  arguments?: Record<string, unknown>;
  /** Required to execute a decision on a destructive tool. */
  confirm?: boolean;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export const ProbabilitySchema = z.number().min(0).max(1);
const PathSchema = z.array(z.string()).min(1);

const JudgementSchema = z.object({
  kind: z.enum(['routing', 'gate', 'argument']),
  path: PathSchema.optional(),
  score: ProbabilitySchema,
  required: z.boolean(),
});

const MetaSchema = z.object({
  model: z.string().nullable(),
  requestIds: z.array(z.string()),
  strategy: z.enum(['none', 'fan_out', 'route_then_arguments']),
  requestCount: z.number().int().min(0),
  toolVersion: z.string().optional(),
});

const RiskSchema = z.enum(['read_only', 'mutating', 'destructive']);

const BoundSchema = {
  tool: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
  /** Optional arguments dropped because their answer was below the argument threshold. */
  dropped: z.array(PathSchema),
  confidence: ProbabilitySchema,
  judgements: z.array(JudgementSchema),
  risk: RiskSchema,
  requiresConfirmation: z.boolean(),
  meta: MetaSchema,
};

const CallDecisionSchema = z.object({ kind: z.literal('call'), ...BoundSchema });

const PartialDecisionSchema = z.object({
  kind: z.literal('partial'),
  ...BoundSchema,
  missing: z.array(PathSchema),
  /** Low-confidence guesses for required arguments, keyed by argument name. */
  suggestions: z.record(z.string(), z.unknown()),
});

const AbstainDecisionSchema = z.object({
  kind: z.literal('abstain'),
  reason: z.enum(['no_tools', 'empty_state', 'none_fit', 'no_action_requested', 'low_confidence']),
  candidates: z.array(z.object({ tool: z.string(), probability: ProbabilitySchema })),
  confidence: ProbabilitySchema,
  meta: MetaSchema,
});

/** Parses a decision that was stored or sent over the wire. */
export const TypesafeDecisionSchema = z.discriminatedUnion('kind', [
  CallDecisionSchema,
  PartialDecisionSchema,
  AbstainDecisionSchema,
]);

export type TypesafeCallDecision = z.infer<typeof CallDecisionSchema>;
export type TypesafePartialDecision = z.infer<typeof PartialDecisionSchema>;
export type TypesafeAbstainDecision = z.infer<typeof AbstainDecisionSchema>;
export type TypesafeDecision = z.infer<typeof TypesafeDecisionSchema>;
export type TypesafeJudgement = z.infer<typeof JudgementSchema>;
export type TypesafeDecisionMeta = z.infer<typeof MetaSchema>;

// ---------------------------------------------------------------------------
// Companion helpers
// ---------------------------------------------------------------------------

export interface TypesafeShortlistOptions extends TypesafeRequestOptions {
  /** How many tools to keep. */
  k: number;
  model?: string;
}

export interface TypesafeShortlist {
  /** The top `k` raw tools, best first. */
  tools: Tool[];
  scores: Array<{ slug: string; score: number }>;
}

export interface TypesafeGateContext {
  toolSlug: string;
  toolkitSlug: string;
  params: ToolExecuteParams;
}

export interface TypesafeGateOptions {
  /** The raw tools the gate may approve. Any other tool is blocked. */
  tools: Tool[];
  /** Returns the user-authored request. Never return LLM-written text. */
  getRequest: (context: TypesafeGateContext) => string | Promise<string>;
  getContext?: (context: TypesafeGateContext) => TypesafeJsonValue | Promise<TypesafeJsonValue>;
  /** Default 0.7. */
  threshold?: number;
  /** What to do when Jev cannot be reached. Default `block`. */
  onUnavailable?: 'block' | 'allow';
  /** Called for every call allowed through without an answer from Jev. */
  onBypass?: (info: { toolSlug: string; reason: TypesafeAvailabilityReason }) => void;
  /** After this many vetoes the gate blocks every later call. Default 3. */
  maxVetoes?: number;
  /**
   * Replace secret-bearing arguments before they are sent to TypeSafe. It gets a copy, so the
   * executed call never changes. The return must be a masking of the input: the same JSON
   * structure (same keys, same array lengths) with every leaf replaced by a value of the same
   * scalar type. Anything that deletes, adds, retypes, or is not an object blocks the call,
   * because Jev must approve the call that actually runs.
   */
  redactArguments?: (toolSlug: string, args: Record<string, unknown>) => Record<string, unknown>;
  model?: string;
  timeout?: number;
}

export type TypesafeAvailabilityReason = Extract<
  TypesafeApiErrorReason,
  'connection' | 'timeout' | 'server_error' | 'rate_limit'
>;

// ---------------------------------------------------------------------------
// Errors
//
// Messages are static templates plus a status code and a request ID. No error
// holds state, argument values, response content, or the SDK's own error.
// ---------------------------------------------------------------------------

export interface TypesafeErrorDiagnostics {
  status?: number;
  requestId?: string;
  retryAfterMs?: number;
}

const describeDiagnostics = ({ status, requestId }: TypesafeErrorDiagnostics): string =>
  [status === undefined ? '' : ` (status ${status})`, requestId ? ` [request ${requestId}]` : '']
    .join('')
    .trimEnd();

export class TypesafeProviderError extends ComposioError {
  constructor(code: string, message: string) {
    super(message, { code });
    this.name = new.target.name;
  }
}

export class TypesafeInvalidOptionsError extends TypesafeProviderError {
  constructor(message: string) {
    super('TYPESAFE_INVALID_OPTIONS', message);
  }
}

export class TypesafeDuplicateToolError extends TypesafeProviderError {
  constructor() {
    super('TYPESAFE_DUPLICATE_TOOL', 'Two tools in the same tool set share a slug.');
  }
}

export class TypesafeMissingApiKeyError extends TypesafeProviderError {
  constructor() {
    super(
      'TYPESAFE_MISSING_API_KEY',
      'No TypeSafe API key was found. Set TYPESAFE_API_KEY, or pass `apiKey` or `client` to TypesafeProvider.'
    );
  }
}

export class TypesafeLimitError extends TypesafeProviderError {
  constructor(readonly limit: 'tools' | 'request_budget') {
    super(
      'TYPESAFE_LIMIT',
      limit === 'tools'
        ? 'A tool set holds at most 254 tools.'
        : 'The state and questions exceed the TypeSafe request budget. State is never truncated.'
    );
  }
}

const API_ERROR_SUMMARIES = {
  rate_limit: 'The TypeSafe API rate limit was exceeded.',
  authentication: 'The TypeSafe API rejected the API key.',
  server_error: 'The TypeSafe API failed to handle the request.',
  request_rejected: 'The TypeSafe API rejected the request.',
  timeout: 'The TypeSafe API request timed out.',
  connection: 'The TypeSafe API could not be reached.',
  aborted: 'The TypeSafe API request was aborted.',
  unknown: 'The TypeSafe API request failed.',
};

export type TypesafeApiErrorReason = keyof typeof API_ERROR_SUMMARIES;

/** Any failed TypeSafe request. `reason` tells the failures apart. */
export class TypesafeApiError extends TypesafeProviderError {
  readonly status?: number;
  readonly requestId?: string;
  /** Set for `rate_limit` when the API sent a retry delay. */
  readonly retryAfterMs?: number;
  constructor(
    readonly reason: TypesafeApiErrorReason,
    diagnostics: TypesafeErrorDiagnostics = {}
  ) {
    super(
      'TYPESAFE_API_ERROR',
      `${API_ERROR_SUMMARIES[reason]}${describeDiagnostics(diagnostics)}`
    );
    this.status = diagnostics.status;
    this.requestId = diagnostics.requestId;
    this.retryAfterMs = diagnostics.retryAfterMs;
  }
}

export type TypesafeMalformedResponseIssue =
  'invalid_envelope' | 'missing_answer' | 'invalid_answer' | 'choice_outside_options';

export class TypesafeMalformedResponseError extends TypesafeProviderError {
  constructor(
    readonly issue: TypesafeMalformedResponseIssue,
    readonly requestId?: string
  ) {
    super(
      'TYPESAFE_MALFORMED_RESPONSE',
      `The TypeSafe API returned a malformed response: ${issue}${describeDiagnostics({ requestId })}`
    );
  }
}

export class TypesafeMalformedDecisionError extends TypesafeProviderError {
  constructor() {
    super('TYPESAFE_MALFORMED_DECISION', 'The decision does not match TypesafeDecisionSchema.');
  }
}

export class TypesafeAbstainedDecisionError extends TypesafeProviderError {
  constructor() {
    super('TYPESAFE_ABSTAINED_DECISION', 'An abstain decision cannot be executed.');
  }
}

export class TypesafeIncompleteDecisionError extends TypesafeProviderError {
  /** `missing` holds the argument paths that still need a caller value: names, never values. */
  constructor(readonly missing: string[][]) {
    super(
      'TYPESAFE_INCOMPLETE_DECISION',
      'The decision still has required arguments missing. Pass them as caller arguments.'
    );
  }
}

export class TypesafeConfirmationRequiredError extends TypesafeProviderError {
  constructor() {
    super(
      'TYPESAFE_CONFIRMATION_REQUIRED',
      'This decision targets a destructive tool. Pass `confirm: true` to execute it.'
    );
  }
}

export class TypesafeGateVetoError extends TypesafeProviderError {
  constructor(
    readonly probability: number,
    readonly threshold: number
  ) {
    super(
      'TYPESAFE_GATE_VETO',
      'The confidence gate vetoed this tool call: it does not match the user request.'
    );
  }
}

export class TypesafeGateUnavailableError extends TypesafeProviderError {
  constructor(readonly reason: TypesafeAvailabilityReason) {
    super(
      'TYPESAFE_GATE_UNAVAILABLE',
      `The confidence gate could not reach TypeSafe (${reason}) and blocked this tool call.`
    );
  }
}

export type TypesafeGateBlockReason =
  'unknown_tool' | 'oversized_call' | 'max_vetoes' | 'check_failed';

export class TypesafeGateBlockedError extends TypesafeProviderError {
  constructor(readonly reason: TypesafeGateBlockReason) {
    super('TYPESAFE_GATE_BLOCKED', `The confidence gate blocked this tool call: ${reason}.`);
  }
}
