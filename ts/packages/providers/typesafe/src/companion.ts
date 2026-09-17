import type { Tool, beforeExecuteModifier } from '@composio/core';
import { z } from 'zod/v3';
import { ROUTING_QUESTION_ID, routingDescriptionOf, routingQuestion } from './compile';
import {
  MAX_TOOLS,
  REQUEST_BUDGET_TOKENS,
  estimateTokens,
  normalizeState,
  stable,
  type Ask,
} from './decide';
import {
  TypesafeApiError,
  TypesafeGateBlockedError,
  TypesafeGateUnavailableError,
  TypesafeGateVetoError,
  TypesafeInvalidOptionsError,
  TypesafeLimitError,
  TypesafeMalformedResponseError,
  type TypesafeAvailabilityReason,
  type TypesafeGateOptions,
  type TypesafeJsonValue,
  type TypesafeNoulQuestion,
  type TypesafeShortlist,
  type TypesafeState,
} from './types';

/** Ranks raw tools against a state. Routing sees `request` only, never `context`. */
export async function shortlistTools(
  tools: Tool[],
  state: TypesafeState,
  k: number,
  ask: Ask
): Promise<TypesafeShortlist> {
  if (!Number.isInteger(k) || k < 0) {
    throw new TypesafeInvalidOptionsError('`k` must be a non-negative integer.');
  }
  if (tools.length > MAX_TOOLS) throw new TypesafeLimitError('tools');
  const normalized = normalizeState(state);
  if (k === 0 || tools.length === 0 || normalized.request.trim().length === 0) {
    return { tools: [], scores: [] };
  }

  // Routing needs the slug and the routing text only, so the argument schemas stay unread.
  const routing = routingQuestion(
    tools.map(tool => ({ slug: tool.slug, routingDescription: routingDescriptionOf(tool) }))
  );
  const questions = { [ROUTING_QUESTION_ID]: routing.question };
  if (estimateTokens(normalized.requestOnly, questions) > REQUEST_BUDGET_TOKENS) {
    throw new TypesafeLimitError('request_budget');
  }
  const answers = await ask(normalized.requestOnly, questions);
  const route = answers.choices.get(ROUTING_QUESTION_ID);
  if (route === undefined) throw new TypesafeMalformedResponseError('missing_answer');

  const ranked = tools
    .map((tool, index) => ({ tool, index, score: route.probabilities[routing.keys[index]] ?? 0 }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, k);
  return {
    tools: ranked.map(entry => entry.tool),
    scores: ranked.map(entry => ({ slug: entry.tool.slug, score: entry.score })),
  };
}

const GATE_QUESTION_ID = 'gate';

// Static text. The proposed call travels in state under `proposed_call`, so text an LLM
// wrote into the arguments never sits inside the question.
const GATE_QUESTION: TypesafeNoulQuestion = {
  type: 'noul',
  instructions:
    'Does running the tool in `proposed_call` with those arguments carry out what `request` asks for?',
  criteria: {
    true: 'The proposed call does what the user asked for in `request`.',
    false: 'The proposed call does something the user did not ask for, or contradicts `request`.',
  },
};

const RedactedArgumentsSchema = z.record(z.string(), z.unknown());

// A value that is not JSON blocks the call. Nothing is dropped or rewritten to let it through.
function jsonOrBlock(value: unknown): TypesafeJsonValue {
  try {
    return stable(value);
  } catch {
    throw new TypesafeGateBlockedError('check_failed');
  }
}

const scalarTypeOf = (value: TypesafeJsonValue): string => (value === null ? 'null' : typeof value);

/**
 * The redactor is a masker: the redacted arguments must have exactly the original's JSON
 * structure — the same key sets, the same array lengths — and every leaf replacement must
 * keep the same scalar type. Anything else blocks, because Jev would approve a call that
 * differs from the one that runs.
 */
function assertMaskingOnly(original: TypesafeJsonValue, redacted: TypesafeJsonValue): void {
  if (Array.isArray(original)) {
    if (!Array.isArray(redacted) || redacted.length !== original.length) {
      throw new TypesafeGateBlockedError('check_failed');
    }
    original.forEach((entry, index) => assertMaskingOnly(entry, redacted[index]));
    return;
  }
  if (original !== null && typeof original === 'object') {
    if (redacted === null || typeof redacted !== 'object' || Array.isArray(redacted)) {
      throw new TypesafeGateBlockedError('check_failed');
    }
    const originalKeys = Object.keys(original).sort();
    const redactedKeys = Object.keys(redacted).sort();
    if (
      originalKeys.length !== redactedKeys.length ||
      originalKeys.some((key, index) => key !== redactedKeys[index])
    ) {
      throw new TypesafeGateBlockedError('check_failed');
    }
    for (const key of originalKeys) assertMaskingOnly(original[key], redacted[key]);
    return;
  }
  if (scalarTypeOf(original) !== scalarTypeOf(redacted)) {
    throw new TypesafeGateBlockedError('check_failed');
  }
}

const AVAILABILITY_REASONS: ReadonlyArray<string> = [
  'timeout',
  'connection',
  'server_error',
  'rate_limit',
] satisfies TypesafeAvailabilityReason[];

const isUnavailable = (
  error: unknown
): error is TypesafeApiError & { reason: TypesafeAvailabilityReason } =>
  error instanceof TypesafeApiError && AVAILABILITY_REASONS.includes(error.reason);

/**
 * Builds a `beforeExecute` modifier that asks Jev whether a proposed tool call matches the
 * user's request. Create one gate per agent run and reuse it across that run's retries.
 */
export function confidenceGate(options: TypesafeGateOptions, ask: Ask): beforeExecuteModifier {
  const threshold = options.threshold ?? 0.7;
  const maxVetoes = options.maxVetoes ?? 3;
  if (!(threshold >= 0 && threshold <= 1)) {
    throw new TypesafeInvalidOptionsError('The gate threshold must be a number from 0 to 1.');
  }
  if (!Number.isInteger(maxVetoes) || maxVetoes < 1) {
    throw new TypesafeInvalidOptionsError('`maxVetoes` must be a positive integer.');
  }
  if (
    options.onUnavailable !== undefined &&
    options.onUnavailable !== 'block' &&
    options.onUnavailable !== 'allow'
  ) {
    // A typo'd mode must never fail open at check time.
    throw new TypesafeInvalidOptionsError("`onUnavailable` must be 'block' or 'allow'.");
  }
  const tools = new Map(options.tools.map(tool => [tool.slug, tool]));
  let vetoes = 0;
  // Checks run one at a time. Concurrent calls would otherwise all read the veto count
  // before any of them raised it.
  let settled: Promise<unknown> = Promise.resolve();

  const check: beforeExecuteModifier = async context => {
    // A hijacked LLM must not be able to vary arguments until one call passes.
    if (vetoes >= maxVetoes) throw new TypesafeGateBlockedError('max_vetoes');
    const tool = tools.get(context.toolSlug);
    if (tool === undefined) throw new TypesafeGateBlockedError('unknown_tool');

    const callArguments = context.params.arguments ?? {};
    const request = await options.getRequest(context);
    const gateContext = await options.getContext?.(context);
    let sentArguments = callArguments;
    if (options.redactArguments !== undefined) {
      // The redactor works on a copy, so redacting in place cannot alter the executed call.
      // A return that is not an object blocks: falling back would send the secrets.
      // The originals are checked first, since cloning flattens a class instance into JSON.
      const original = jsonOrBlock(callArguments);
      const redacted = options.redactArguments(tool.slug, structuredClone(callArguments));
      if (!RedactedArgumentsSchema.safeParse(redacted).success) {
        throw new TypesafeGateBlockedError('check_failed');
      }
      // Jev evaluates what is sent, and the original arguments run. The redactor may only
      // mask, so an approved call is exactly the call that executes.
      assertMaskingOnly(original, jsonOrBlock(redacted));
      sentArguments = redacted;
    }
    // Only the slug and the arguments are copied out of the execution parameters.
    // `userId`, `connectedAccountId`, and the custom auth fields never leave. The `context`
    // key exists only when there is one, so a context-less state stays context-less.
    const state = jsonOrBlock({
      request,
      ...(gateContext === undefined ? {} : { context: gateContext }),
      proposed_call: {
        tool: tool.slug,
        description: tool.description ?? tool.name,
        arguments: sentArguments,
      },
    });
    const questions = { [GATE_QUESTION_ID]: GATE_QUESTION };
    // Arguments are never truncated to fit.
    if (estimateTokens(state, questions) > REQUEST_BUDGET_TOKENS) {
      throw new TypesafeGateBlockedError('oversized_call');
    }

    let probability: number;
    try {
      const answers = await ask(state, questions);
      const answer = answers.nouls.get(GATE_QUESTION_ID);
      if (answer === undefined) throw new TypesafeMalformedResponseError('missing_answer');
      probability = answer.noul;
    } catch (error) {
      if (error instanceof TypesafeApiError && error.reason === 'aborted') throw error;
      if (!isUnavailable(error)) throw new TypesafeGateBlockedError('check_failed');
      if ((options.onUnavailable ?? 'block') === 'block') {
        throw new TypesafeGateUnavailableError(error.reason);
      }
      options.onBypass?.({ toolSlug: tool.slug, reason: error.reason });
      return context.params;
    }

    if (probability >= threshold) return context.params;
    vetoes += 1;
    throw new TypesafeGateVetoError(probability, threshold);
  };

  return context => {
    const result = settled.then(() => check(context));
    settled = result.catch(() => undefined);
    return result;
  };
}
