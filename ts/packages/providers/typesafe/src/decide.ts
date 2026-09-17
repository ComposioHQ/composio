import { z } from 'zod/v3';
import { ROUTING_QUESTION_ID, routingQuestion } from './compile';
import { NONE_KEY, optionValues } from './keys';
import {
  isSizeRejection,
  toProviderError,
  validateAnswers,
  type ValidatedAnswers,
} from './response';
import {
  TypesafeAbortError,
  TypesafeInvalidOptionsError,
  TypesafeLimitError,
  TypesafeMalformedResponseError,
  TypesafeProviderError,
  type TypesafeAbstainDecision,
  type TypesafeArgumentQuestion,
  type TypesafeClientLike,
  type TypesafeContextScope,
  type TypesafeDecideOptions,
  type TypesafeDecision,
  type TypesafeDecisionMeta,
  type TypesafeJsonValue,
  type TypesafeJudgement,
  type TypesafeNoulQuestion,
  type TypesafeQuestion,
  type TypesafeRequestOptions,
  type TypesafeState,
  type TypesafeThresholds,
  type TypesafeToolQuestions,
  type TypesafeToolSet,
  type TypesafeToolThresholds,
} from './types';

/** A routing Choice holds every tool plus the none option, and a Choice takes 255 options. */
export const MAX_TOOLS = 254;

/** A margin below the documented 32k tokens for state plus the longest question. */
export const REQUEST_BUDGET_TOKENS = 24_000;

export const DEFAULT_MODEL = 'jev-latest';
export const DEFAULT_THRESHOLDS: TypesafeThresholds = { routing: 0.6, gate: 0.3, argument: 0.6 };
export const DESTRUCTIVE_ROUTING_THRESHOLD = 0.9;

// Yes means "the user asks to perform an action now". A negated instruction must read as no.
const GATE_CRITERIA = {
  true: 'The user tells the assistant to carry out an action now.',
  false:
    'The user asks a question, asks for an explanation, describes something, or says not to do something.',
};
export const GATE_QUESTIONS: ReadonlyArray<TypesafeNoulQuestion> = [
  {
    type: 'noul',
    instructions: 'Is the user asking for an action to be performed now?',
    criteria: GATE_CRITERIA,
  },
  {
    type: 'noul',
    instructions:
      'Does the user instruct the assistant to do something, rather than ask how something works?',
    criteria: GATE_CRITERIA,
  },
  {
    type: 'noul',
    instructions: 'Should a tool be run right now to satisfy this request?',
    criteria: GATE_CRITERIA,
  },
];
const gateId = (index: number): string => `gate_${index}`;

// ---------------------------------------------------------------------------
// Options and state
// ---------------------------------------------------------------------------

const ThresholdSchema = z.number().min(0).max(1);
const ThresholdsSchema = z
  .object({ routing: ThresholdSchema, gate: ThresholdSchema, argument: ThresholdSchema })
  .partial()
  .strict();
const ToolThresholdsSchema = z.record(z.string(), ThresholdsSchema);

/** Throws on a threshold that is NaN or outside 0-1. */
export function assertThresholds(
  thresholds: Partial<TypesafeThresholds> | undefined,
  toolThresholds: TypesafeToolThresholds | undefined
): void {
  const valid =
    ThresholdsSchema.safeParse(thresholds ?? {}).success &&
    ToolThresholdsSchema.safeParse(toolThresholds ?? {}).success;
  if (!valid) {
    throw new TypesafeInvalidOptionsError('Every threshold must be a number from 0 to 1.');
  }
}

const ContextScopeSchema = z.enum(['arguments', 'all']).optional();

/** Throws on an unknown scope, which would otherwise send `context` to routing and the gate. */
export function assertContextScope(contextScope: unknown): void {
  if (!ContextScopeSchema.safeParse(contextScope).success) {
    throw new TypesafeInvalidOptionsError("`contextScope` must be 'arguments' or 'all'.");
  }
}

// Strict, so a misspelled `context` throws instead of silently never being sent.
const StateSchema = z.union([
  z.string(),
  z.object({ request: z.string(), context: z.unknown().optional() }).strict(),
]);

const notJson = (): TypesafeInvalidOptionsError =>
  new TypesafeInvalidOptionsError(
    'State holds a value that is not JSON. Serialize dates, big integers, and binary data before passing them.'
  );

/**
 * Rebuilds a JSON value with sorted object keys, so equal states serialize identically.
 * Throws on a value JSON cannot hold, which `JSON.stringify` would drop or rewrite silently.
 */
export function stable(
  value: unknown,
  ancestors: ReadonlySet<object> = new Set()
): TypesafeJsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw notJson();
    return value;
  }
  if (typeof value !== 'object') throw notJson();
  // A value that contains itself has no JSON form.
  if (ancestors.has(value)) throw notJson();
  const path = new Set(ancestors).add(value);
  if (Array.isArray(value)) return Array.from(value, entry => stable(entry, path));
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw notJson();
  // `fromEntries` defines own properties, so a `__proto__` key stays data.
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, stable(entry, path)])
  );
}

interface NormalizedState {
  request: string;
  /** What routing and the action gate see. */
  requestOnly: TypesafeJsonValue;
  /** What argument questions see. */
  full: TypesafeJsonValue;
  hasContext: boolean;
}

export function normalizeState(state: TypesafeState): NormalizedState {
  const parsed = StateSchema.safeParse(state);
  if (!parsed.success) {
    throw new TypesafeInvalidOptionsError(
      'State must be a string or an object with a string `request` and an optional `context`. Other top-level keys are not sent, so they are rejected.'
    );
  }
  if (typeof parsed.data === 'string') {
    return { request: parsed.data, requestOnly: parsed.data, full: parsed.data, hasContext: false };
  }
  const { request, context } = parsed.data;
  const hasContext = context !== undefined && context !== null;
  return {
    request,
    requestOnly: { request },
    full: hasContext ? { context: stable(context), request } : { request },
    hasContext,
  };
}

/** Characters divided by 4. */
export const estimateTokens = (
  state: TypesafeJsonValue,
  questions: Record<string, TypesafeQuestion>
): number => Math.ceil((JSON.stringify(state).length + JSON.stringify(questions).length) / 4);

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

export interface AskResult extends ValidatedAnswers {
  requestId?: string;
}

export type Ask = (
  state: TypesafeJsonValue,
  questions: Record<string, TypesafeQuestion>
) => Promise<AskResult>;

/** One validated round trip. Every failure leaves as a provider error with safe diagnostics. */
export function createAsk(
  getClient: () => Promise<TypesafeClientLike>,
  model: string,
  requestOptions: TypesafeRequestOptions,
  onRequest?: (requestId: string | undefined) => void
): Ask {
  return async (state, questions) => {
    if (requestOptions.signal?.aborted) throw new TypesafeAbortError();
    const client = await getClient();
    let data: unknown;
    let requestId: string | undefined;
    try {
      const options: TypesafeRequestOptions = {
        ...(requestOptions.signal === undefined ? {} : { signal: requestOptions.signal }),
        ...(requestOptions.timeout === undefined ? {} : { timeout: requestOptions.timeout }),
      };
      const pending = client.systemOne({ state, questions, model }, options);
      if (typeof pending.withResponse === 'function') {
        ({ data, requestId } = await pending.withResponse());
      } else {
        data = await pending;
      }
    } catch (error) {
      onRequest?.(undefined);
      throw toProviderError(error);
    }
    onRequest?.(requestId);
    return { ...validateAnswers(data, questions, requestId), requestId };
  };
}

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

export interface DecideSettings {
  thresholds?: Partial<TypesafeThresholds>;
  toolThresholds?: TypesafeToolThresholds;
  contextScope?: TypesafeContextScope;
}

const toolPrefix = (toolIndex: number): string => `t${toolIndex}_`;

function argumentQuestions(
  tool: TypesafeToolQuestions,
  toolIndex: number,
  prefilled: ReadonlySet<string>
): Record<string, TypesafeQuestion> {
  const questions: Record<string, TypesafeQuestion> = {};
  const prefix = toolPrefix(toolIndex);
  for (const argument of tool.arguments) {
    if (prefilled.has(argument.name)) continue;
    if (argument.kind === 'choice') {
      questions[prefix + argument.questionId] = argument.question;
      continue;
    }
    questions[prefix + argument.mentionedId] = argument.mentioned;
    for (const member of argument.members) questions[prefix + member.questionId] = member.question;
  }
  return questions;
}

type ArgumentOutcome = { kind: 'not_stated' } | { kind: 'stated'; value: unknown; score: number };

function readArgument(
  argument: TypesafeArgumentQuestion,
  prefix: string,
  answers: ValidatedAnswers
): ArgumentOutcome {
  if (argument.kind === 'choice') {
    const answer = answers.choices.get(prefix + argument.questionId);
    if (answer === undefined || answer.choice === argument.notStatedKey)
      return { kind: 'not_stated' };
    const values = optionValues(argument.options);
    if (!values.has(answer.choice)) return { kind: 'not_stated' };
    return { kind: 'stated', value: values.get(answer.choice), score: answer.confidence };
  }

  const mentioned = answers.nouls.get(prefix + argument.mentionedId)?.noul ?? 0;
  if (mentioned < 0.5) return { kind: 'not_stated' };
  const members = argument.members.map((member, index) => ({
    index,
    value: member.value,
    probability: answers.nouls.get(prefix + member.questionId)?.noul ?? 0,
  }));
  const selected = members
    .filter(member => member.probability >= 0.5)
    .sort((left, right) => right.probability - left.probability || left.index - right.index)
    .slice(0, argument.maxItems ?? members.length)
    .sort((left, right) => left.index - right.index);
  const score = Math.min(
    mentioned,
    ...members.map(member => Math.max(member.probability, 1 - member.probability))
  );
  return { kind: 'stated', value: selected.map(member => member.value), score };
}

// An explicit `undefined` must read as an omitted key, or a spread would erase the layer below.
function defined(thresholds: Partial<TypesafeThresholds> | undefined): Partial<TypesafeThresholds> {
  const kept: Partial<TypesafeThresholds> = {};
  if (thresholds?.routing !== undefined) kept.routing = thresholds.routing;
  if (thresholds?.gate !== undefined) kept.gate = thresholds.gate;
  if (thresholds?.argument !== undefined) kept.argument = thresholds.argument;
  return kept;
}

function resolveThresholds(
  tool: TypesafeToolQuestions | undefined,
  provider: DecideSettings,
  call: TypesafeDecideOptions
): TypesafeThresholds {
  const base = {
    ...DEFAULT_THRESHOLDS,
    ...defined(provider.thresholds),
    ...defined(call.thresholds),
  };
  if (tool === undefined) return base;
  const perTool = {
    ...defined(provider.toolThresholds?.[tool.slug]),
    ...defined(call.toolThresholds?.[tool.slug]),
  };
  return {
    // Only an explicit per-tool override lowers a destructive tool's routing threshold.
    routing:
      perTool.routing ??
      (tool.risk === 'destructive'
        ? Math.max(base.routing, DESTRUCTIVE_ROUTING_THRESHOLD)
        : base.routing),
    gate: perTool.gate ?? base.gate,
    argument: perTool.argument ?? base.argument,
  };
}

export async function decide(
  toolSet: TypesafeToolSet,
  state: TypesafeState,
  settings: DecideSettings,
  options: TypesafeDecideOptions,
  getClient: () => Promise<TypesafeClientLike>,
  defaultModel: string
): Promise<TypesafeDecision> {
  assertThresholds(options.thresholds, options.toolThresholds);
  assertContextScope(options.contextScope);
  const normalized = normalizeState(state);
  const meta: TypesafeDecisionMeta = {
    model: null,
    requestIds: [],
    strategy: 'none',
    requestCount: 0,
  };
  const abstain = (
    reason: TypesafeAbstainDecision['reason'],
    candidates: TypesafeAbstainDecision['candidates'] = [],
    confidence = 0
  ): TypesafeAbstainDecision => ({ kind: 'abstain', reason, candidates, confidence, meta });

  const { tools } = toolSet;
  if (tools.length === 0) return abstain('no_tools');
  if (normalized.request.trim().length === 0) return abstain('empty_state');
  if (tools.length > MAX_TOOLS) throw new TypesafeLimitError('tools');

  const ask = createAsk(getClient, options.model ?? defaultModel, options, requestId => {
    meta.requestCount += 1;
    if (requestId !== undefined) meta.requestIds.push(requestId);
  });

  const routing = routingQuestion(tools);
  const routeQuestions: Record<string, TypesafeQuestion> = {
    [ROUTING_QUESTION_ID]: routing.question,
  };
  GATE_QUESTIONS.forEach((question, index) => {
    routeQuestions[gateId(index)] = question;
  });

  const contextScope = options.contextScope ?? settings.contextScope ?? 'arguments';
  // Routing and the gate never see `context` unless the caller opts in. The split is
  // structural: Jev is not an LLM, so telling it to ignore `context` is not a control.
  const splitContext = normalized.hasContext && contextScope === 'arguments';
  const routeState = splitContext ? normalized.requestOnly : normalized.full;
  if (estimateTokens(routeState, routeQuestions) > REQUEST_BUDGET_TOKENS) {
    throw new TypesafeLimitError('request_budget');
  }

  const prefilled = options.arguments ?? {};
  const prefilledNames = new Set(
    Object.entries(prefilled)
      .filter(([, value]) => value !== undefined)
      .map(([name]) => name)
  );

  let answers: ValidatedAnswers | undefined;
  let argumentAnswers: ValidatedAnswers | undefined;

  if (!splitContext) {
    const fanOut = { ...routeQuestions };
    tools.forEach((tool, index) =>
      Object.assign(fanOut, argumentQuestions(tool, index, prefilledNames))
    );
    if (estimateTokens(normalized.full, fanOut) <= REQUEST_BUDGET_TOKENS) {
      try {
        answers = await ask(normalized.full, fanOut);
        argumentAnswers = answers;
        meta.strategy = 'fan_out';
      } catch (error) {
        // The estimate undercounted. Fall back to route-first once; a second rejection throws.
        if (!(error instanceof TypesafeProviderError) || !isSizeRejection(error)) throw error;
      }
    }
  }
  if (answers === undefined) {
    meta.strategy = 'route_then_arguments';
    answers = await ask(routeState, routeQuestions);
  }
  meta.model = answers.model;

  const route = answers.choices.get(ROUTING_QUESTION_ID);
  if (route === undefined) throw new TypesafeMalformedResponseError('missing_answer');
  const candidates = tools
    .map((tool, index) => ({
      tool: tool.slug,
      probability: route.probabilities[routing.keys[index]] ?? 0,
      index,
    }))
    .sort((left, right) => right.probability - left.probability || left.index - right.index)
    .map(({ tool, probability }) => ({ tool, probability }));
  const topConfidence =
    route.choice === NONE_KEY ? (candidates[0]?.probability ?? 0) : route.confidence;

  const gateScores = GATE_QUESTIONS.map((_, index) => answers.nouls.get(gateId(index))?.noul ?? 0);
  // The gate contributes its probability directly, so a confident "no action" abstains.
  const gate = gateScores.reduce((sum, score) => sum + score, 0) / gateScores.length;

  const toolIndex = routing.keys.indexOf(route.choice);
  const tool = toolIndex === -1 ? undefined : tools[toolIndex];
  const thresholds = resolveThresholds(tool, settings, options);

  if (gate < thresholds.gate) return abstain('no_action_requested', candidates, topConfidence);
  if (tool === undefined) return abstain('none_fit', candidates, topConfidence);
  if (route.confidence < thresholds.routing)
    return abstain('low_confidence', candidates, topConfidence);

  if (tool.version !== undefined) meta.toolVersion = tool.version;
  if (argumentAnswers === undefined) {
    const questions = argumentQuestions(tool, toolIndex, prefilledNames);
    if (Object.keys(questions).length > 0) {
      if (estimateTokens(normalized.full, questions) > REQUEST_BUDGET_TOKENS) {
        throw new TypesafeLimitError('request_budget');
      }
      argumentAnswers = await ask(normalized.full, questions);
    }
  }

  const judgements: TypesafeJudgement[] = [
    { kind: 'routing', score: route.confidence, required: true },
    { kind: 'gate', score: gate, required: true },
  ];
  const bound: Record<string, unknown> = {};
  const suggestions: Record<string, unknown> = {};
  const dropped: string[][] = [];
  const stated = new Set<string>();
  const prefix = toolPrefix(toolIndex);

  for (const argument of tool.arguments) {
    if (prefilledNames.has(argument.name) || argumentAnswers === undefined) continue;
    const outcome = readArgument(argument, prefix, argumentAnswers);
    if (outcome.kind === 'not_stated') continue;
    const confident = outcome.score >= thresholds.argument;
    judgements.push({
      kind: 'argument',
      path: [argument.name],
      score: outcome.score,
      // A judgement counts toward the call confidence only when the call depends on it.
      required: argument.required && confident,
    });
    if (confident) {
      bound[argument.name] = outcome.value;
      stated.add(argument.name);
    } else if (argument.required) {
      suggestions[argument.name] = outcome.value;
    } else {
      dropped.push([argument.name]);
    }
  }

  const callArguments = { ...bound };
  for (const name of prefilledNames) callArguments[name] = prefilled[name];
  const missing = tool.required
    .filter(name => !stated.has(name) && !prefilledNames.has(name))
    .map(name => [name]);
  const confidence = Math.min(
    ...judgements.filter(judgement => judgement.required).map(judgement => judgement.score)
  );
  const shared = {
    tool: tool.slug,
    arguments: callArguments,
    dropped,
    confidence,
    judgements,
    risk: tool.risk,
    requiresConfirmation: tool.risk === 'destructive',
    meta,
  };
  return missing.length === 0
    ? { kind: 'call', ...shared }
    : { kind: 'partial', ...shared, missing, suggestions };
}
