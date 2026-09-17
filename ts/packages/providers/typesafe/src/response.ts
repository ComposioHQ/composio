import { z } from 'zod/v3';
import {
  ProbabilitySchema,
  TypesafeApiError,
  TypesafeMalformedResponseError,
  TypesafeProviderError,
  type TypesafeApiErrorReason,
  type TypesafeQuestion,
} from './types';

const EnvelopeSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), z.unknown()),
});

const NoulAnswerSchema = z.object({ type: z.literal('noul'), noul: ProbabilitySchema });

const ChoiceAnswerSchema = z.object({
  type: z.literal('choice'),
  choice: z.string(),
  confidence: ProbabilitySchema,
  probabilities: z.record(z.string(), ProbabilitySchema),
});

export type NoulAnswer = z.infer<typeof NoulAnswerSchema>;
export type ChoiceAnswer = z.infer<typeof ChoiceAnswerSchema>;

export interface ValidatedAnswers {
  model: string;
  nouls: Map<string, NoulAnswer>;
  choices: Map<string, ChoiceAnswer>;
}

/**
 * The JS SDK returns `parsed as T` with no runtime check, so every response is
 * validated here against the questions that were asked.
 */
export function validateAnswers(
  data: unknown,
  questions: Record<string, TypesafeQuestion>,
  requestId: string | undefined
): ValidatedAnswers {
  const envelope = EnvelopeSchema.safeParse(data);
  if (!envelope.success) throw new TypesafeMalformedResponseError('invalid_envelope', requestId);

  const nouls = new Map<string, NoulAnswer>();
  const choices = new Map<string, ChoiceAnswer>();
  const answers = new Map(Object.entries(envelope.data.answers));
  for (const [questionId, question] of Object.entries(questions)) {
    if (!answers.has(questionId)) {
      throw new TypesafeMalformedResponseError('missing_answer', requestId);
    }
    if (question.type === 'noul') {
      const answer = NoulAnswerSchema.safeParse(answers.get(questionId));
      if (!answer.success) throw new TypesafeMalformedResponseError('invalid_answer', requestId);
      nouls.set(questionId, answer.data);
      continue;
    }
    const answer = ChoiceAnswerSchema.safeParse(answers.get(questionId));
    if (!answer.success) throw new TypesafeMalformedResponseError('invalid_answer', requestId);
    const optionKeys = new Set(Object.keys(question.criteria));
    const known = [answer.data.choice, ...Object.keys(answer.data.probabilities)];
    if (!known.every(key => optionKeys.has(key))) {
      throw new TypesafeMalformedResponseError('choice_outside_options', requestId);
    }
    choices.set(questionId, answer.data);
  }
  return { model: envelope.data.model, nouls, choices };
}

// Only these fields are ever read from an SDK error. The error itself, its
// message, body, headers, and stack are never retained.
const SdkErrorSchema = z.object({
  name: z.string().optional().catch(undefined),
  status: z.number().int().optional().catch(undefined),
  requestId: z.string().optional().catch(undefined),
  retryAfterMs: z.number().optional().catch(undefined),
});

function reasonOf(name: string | undefined, status: number | undefined): TypesafeApiErrorReason {
  if (name === 'APIUserAbortError' || name === 'AbortError') return 'aborted';
  if (name === 'APITimeoutError' || name === 'TimeoutError') return 'timeout';
  if (name === 'APIConnectionError') return 'connection';
  if (name === 'RateLimitError' || status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'authentication';
  if (status !== undefined && status >= 500) return 'server_error';
  if (status !== undefined && status >= 400) return 'request_rejected';
  return 'unknown';
}

/** Maps anything thrown by the client to a provider error that holds safe diagnostics only. */
export function toProviderError(error: unknown): TypesafeProviderError {
  if (error instanceof TypesafeProviderError) return error;
  const parsed = SdkErrorSchema.safeParse(error);
  const { name, ...diagnostics } = parsed.success ? parsed.data : {};
  return new TypesafeApiError(reasonOf(name, diagnostics.status), diagnostics);
}

/** A rejection that a smaller request might avoid. */
export const isSizeRejection = (error: unknown): boolean =>
  error instanceof TypesafeApiError &&
  error.reason === 'request_rejected' &&
  (error.status === 400 || error.status === 413 || error.status === 422);
