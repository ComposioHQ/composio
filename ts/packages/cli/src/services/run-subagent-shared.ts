import type { MasterKind } from 'src/services/master-detector';

export type InvokeAgentTarget = 'claude' | 'codex';

export type InvokeAgentNormalizedOptions = {
  readonly target?: InvokeAgentTarget | 'user';
  readonly model?: string;
  readonly schema?: unknown;
  readonly jsonSchema?: unknown;
  readonly structuredSchema?: Record<string, unknown>;
  readonly zodSchema?: {
    safeParse: (
      value: unknown
    ) => { success: true; data: unknown } | { success: false; error: unknown };
  };
};

export type InvokeAgentResponse = {
  readonly master: MasterKind;
  readonly target: InvokeAgentTarget;
  readonly result: string | null;
  readonly structuredOutput?: unknown;
};

export type HelperDebugLog = (step: string, details?: Record<string, unknown>) => void;

export type AcpInvokeFailure =
  | 'adapter_not_found'
  | 'spawn_failed'
  | 'initialize_failed'
  | 'session_failed'
  | 'prompt_failed'
  | 'connection_closed';

export class AcpInvokeError extends Error {
  readonly code: AcpInvokeFailure;

  constructor(code: AcpInvokeFailure, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AcpInvokeError';
    this.code = code;
  }
}

export const isAcpInvokeError = (value: unknown): value is AcpInvokeError =>
  !!value &&
  typeof value === 'object' &&
  (value as { name?: unknown }).name === 'AcpInvokeError' &&
  typeof (value as { message?: unknown }).message === 'string' &&
  typeof (value as { code?: unknown }).code === 'string';

export const toInvokeAgentResponse = (
  master: MasterKind,
  target: InvokeAgentTarget,
  payload: Partial<Pick<InvokeAgentResponse, 'result' | 'structuredOutput'>> = {}
): InvokeAgentResponse => ({
  master,
  target,
  result: payload.result ?? null,
  ...(payload.structuredOutput === undefined || payload.structuredOutput === null
    ? {}
    : { structuredOutput: payload.structuredOutput }),
});

export const parseJson = (text: string): unknown => {
  const value = text.trim();
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const summarizeValidationError = (error: unknown): string => {
  const issues =
    error &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray((error as { issues?: unknown[] }).issues)
      ? (error as { issues: Array<{ path?: unknown[]; message?: unknown }> }).issues
      : [];

  if (issues.length === 0) {
    return 'Invalid structured output.';
  }

  return issues
    .slice(0, 5)
    .map(issue => {
      const path =
        Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join('.') : '<root>';
      const message = typeof issue.message === 'string' ? issue.message : 'Invalid value';
      return `${path}: ${message}`;
    })
    .join('; ');
};

export const buildStructuredPrompt = (
  prompt: string,
  structuredSchema?: Record<string, unknown>
): string => {
  if (!structuredSchema) {
    return prompt;
  }

  return [
    prompt,
    '',
    'Return only a valid JSON value that matches this schema.',
    'Do not include Markdown fences, commentary, or any extra text before or after the JSON.',
    JSON.stringify(structuredSchema, null, 2),
  ].join('\n');
};

export const finalizeInvokeAgentText = (
  text: string,
  options: InvokeAgentNormalizedOptions
): Pick<InvokeAgentResponse, 'result' | 'structuredOutput'> => {
  const trimmed = text.trim();
  if (!options.structuredSchema) {
    return {
      result: trimmed,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('subAgent() expected valid JSON output for structured response.');
  }

  if (options.zodSchema && typeof options.zodSchema.safeParse === 'function') {
    const validation = options.zodSchema.safeParse(parsed);
    if (!validation.success) {
      throw new Error(
        `subAgent() structured output failed schema validation: ${summarizeValidationError(validation.error)}`
      );
    }

    return {
      result: null,
      structuredOutput: validation.data,
    };
  }

  return {
    result: null,
    structuredOutput: parsed,
  };
};
