import { Either, Predicate, Schema } from 'effect';
import { JsonRecordSchema } from 'src/effects/json';
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
  readonly logFilePath?: string;
};

export const ACP_STRUCTURED_OUTPUT_TOOL_NAME = 'submit_structured_output';
export const ACP_STRUCTURED_OUTPUT_WRAPPER_KEY = 'value';

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

const isAcpInvokeFailure = (value: unknown): value is AcpInvokeFailure =>
  value === 'adapter_not_found' ||
  value === 'spawn_failed' ||
  value === 'initialize_failed' ||
  value === 'session_failed' ||
  value === 'prompt_failed' ||
  value === 'connection_closed';

export const isAcpInvokeError = (value: unknown): value is AcpInvokeError =>
  Predicate.isRecord(value) &&
  value.name === 'AcpInvokeError' &&
  typeof value.message === 'string' &&
  isAcpInvokeFailure(value.code);

export const toInvokeAgentResponse = (
  master: MasterKind,
  target: InvokeAgentTarget,
  payload: Partial<Pick<InvokeAgentResponse, 'result' | 'structuredOutput' | 'logFilePath'>> = {}
): InvokeAgentResponse => ({
  master,
  target,
  result: payload.result ?? null,
  ...(payload.structuredOutput === undefined || payload.structuredOutput === null
    ? {}
    : { structuredOutput: payload.structuredOutput }),
  ...(typeof payload.logFilePath === 'string' && payload.logFilePath.length > 0
    ? { logFilePath: payload.logFilePath }
    : {}),
});

/**
 * Sync JSON probe shared with the non-Effect child-process runtime; `Either`
 * is pure data from the already-bundled `effect` package, so it is safe there.
 */
const parseJsonEither = (text: string): Either.Either<unknown, unknown> =>
  Either.try((): unknown => JSON.parse(text));

export const parseJson = (text: string): unknown => {
  const value = text.trim();
  if (!value) {
    return undefined;
  }
  // Non-JSON sub-agent stdout is returned verbatim by design.
  return Either.getOrElse(parseJsonEither(value), (): unknown => value);
};

const decodeStructuredSchema = Schema.decodeUnknownSync(Schema.parseJson(JsonRecordSchema));

export const decodeStructuredSchemaJson = (text: string): Record<string, unknown> =>
  decodeStructuredSchema(text);

const summarizeValidationError = (error: unknown): string => {
  const issues = Predicate.isRecord(error) && Array.isArray(error.issues) ? error.issues : [];

  if (issues.length === 0) {
    return 'Invalid structured output.';
  }

  return issues
    .slice(0, 5)
    .map(issue => {
      if (!Predicate.isRecord(issue)) {
        return '<root>: Invalid value';
      }
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

const isStructuredObjectSchema = (structuredSchema?: Record<string, unknown>): boolean => {
  if (!structuredSchema || Array.isArray(structuredSchema)) {
    return false;
  }

  const schemaType = structuredSchema.type;
  if (schemaType === 'object') {
    return true;
  }

  if (Array.isArray(schemaType) && schemaType.includes('object')) {
    return true;
  }

  return (
    'properties' in structuredSchema ||
    'required' in structuredSchema ||
    'additionalProperties' in structuredSchema
  );
};

export const buildStructuredOutputToolSchema = (
  structuredSchema: Record<string, unknown>
): Record<string, unknown> =>
  isStructuredObjectSchema(structuredSchema)
    ? structuredSchema
    : {
        type: 'object',
        additionalProperties: false,
        required: [ACP_STRUCTURED_OUTPUT_WRAPPER_KEY],
        properties: {
          [ACP_STRUCTURED_OUTPUT_WRAPPER_KEY]: structuredSchema,
        },
      };

export const unwrapStructuredOutputToolPayload = (
  payload: unknown,
  structuredSchema: Record<string, unknown>
): unknown => {
  if (isStructuredObjectSchema(structuredSchema)) {
    return payload;
  }

  if (Predicate.isRecord(payload) && ACP_STRUCTURED_OUTPUT_WRAPPER_KEY in payload) {
    return payload[ACP_STRUCTURED_OUTPUT_WRAPPER_KEY];
  }

  return payload;
};

export const buildStructuredToolPrompt = (
  prompt: string,
  structuredSchema: Record<string, unknown>,
  toolName: string
): string => {
  const usesWrapper = !isStructuredObjectSchema(structuredSchema);
  const toolShapeInstruction = usesWrapper
    ? `Call \`${toolName}\` with a single argument named \`${ACP_STRUCTURED_OUTPUT_WRAPPER_KEY}\` containing the final value.`
    : `Call \`${toolName}\` with the final structured object as the tool arguments.`;

  return [
    prompt,
    '',
    'You may inspect files, search, and use tools as needed before producing the final answer.',
    `When you are ready to deliver the final structured response, call the MCP tool \`${toolName}\` exactly once.`,
    toolShapeInstruction,
    `If the MCP tool \`${toolName}\` is unavailable or you cannot call it, reply with only raw JSON matching the schema.`,
    'Do not include prose, markdown fences, or any text before or after the final structured payload.',
    'The final structured value must match this schema:',
    JSON.stringify(structuredSchema, null, 2),
  ].join('\n');
};

export const buildStructuredRepairPrompt = (
  structuredSchema: Record<string, unknown>,
  toolName?: string
): string =>
  [
    'Your previous response was not valid structured output.',
    'Do not read files. Do not run terminal commands. Do not inspect the workspace again.',
    'Reuse the analysis you already completed.',
    toolName
      ? `If the MCP tool \`${toolName}\` is available, call it exactly once with the final structured result. Otherwise reply with only raw JSON matching the schema.`
      : 'Reply with only raw JSON matching the schema.',
    'Do not include prose, markdown fences, or any extra text.',
    JSON.stringify(structuredSchema, null, 2),
  ].join('\n');

export const validateStructuredOutput = (
  parsed: unknown,
  options: InvokeAgentNormalizedOptions
): unknown => {
  if (options.zodSchema && typeof options.zodSchema.safeParse === 'function') {
    const validation = options.zodSchema.safeParse(parsed);
    if (!validation.success) {
      throw new Error(
        `experimental_subAgent() structured output failed schema validation: ${summarizeValidationError(validation.error)}`
      );
    }

    return validation.data;
  }

  return parsed;
};

const tryParseStructuredJson = (text: string): unknown | undefined => {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  // A parse failure here is the signal to fall through to more permissive
  // extraction for agents that emit a short status line before the final JSON
  // payload, not an error to surface.
  const direct = parseJsonEither(trimmed);
  if (Either.isRight(direct)) {
    return direct.right;
  }

  const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (let index = fencedMatches.length - 1; index >= 0; index -= 1) {
    const candidate = fencedMatches[index]?.[1]?.trim();
    if (!candidate) {
      continue;
    }

    // Probes each fenced block for valid JSON; an invalid block just advances
    // the scan to the next one.
    const fenced = parseJsonEither(candidate);
    if (Either.isRight(fenced)) {
      return fenced.right;
    }
  }

  const findBalancedJsonEnd = (value: string, start: number): number | null => {
    const opening = value[start];
    if (opening !== '{' && opening !== '[') {
      return null;
    }

    const closingStack = [opening === '{' ? '}' : ']'];
    let insideString = false;
    let escaped = false;

    for (let cursor = start + 1; cursor < value.length; cursor += 1) {
      const char = value[cursor]!;
      if (insideString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          insideString = false;
        }
        continue;
      }

      if (char === '"') {
        insideString = true;
        continue;
      }
      if (char === '{') {
        closingStack.push('}');
        continue;
      }
      if (char === '[') {
        closingStack.push(']');
        continue;
      }

      const expected = closingStack.at(-1);
      if ((char === '}' || char === ']') && expected === char) {
        closingStack.pop();
        if (closingStack.length === 0) {
          return cursor;
        }
      }
    }

    return null;
  };

  let bestCandidate:
    | {
        readonly length: number;
        readonly start: number;
        readonly isObject: boolean;
        readonly value: unknown;
      }
    | undefined;

  for (let start = 0; start < trimmed.length; start += 1) {
    const char = trimmed[start];
    if (char !== '{' && char !== '[') {
      continue;
    }

    const end = findBalancedJsonEnd(trimmed, start);
    if (end === null) {
      continue;
    }

    const candidate = trimmed.slice(start, end + 1);
    // Probes each balanced {...}/[...] substring for valid JSON inside a
    // tight scanning loop; a failure just skips the candidate so the scan can
    // keep looking for a larger valid JSON payload.
    const parsedCandidate = parseJsonEither(candidate);
    if (Either.isLeft(parsedCandidate)) {
      continue;
    }

    const parsed = parsedCandidate.right;
    const nextCandidate = {
      length: candidate.length,
      start,
      isObject: !Array.isArray(parsed) && parsed !== null && typeof parsed === 'object',
      value: parsed,
    };

    if (
      !bestCandidate ||
      nextCandidate.length > bestCandidate.length ||
      (nextCandidate.length === bestCandidate.length &&
        nextCandidate.isObject &&
        !bestCandidate.isObject) ||
      (nextCandidate.length === bestCandidate.length &&
        nextCandidate.isObject === bestCandidate.isObject &&
        nextCandidate.start < bestCandidate.start)
    ) {
      bestCandidate = nextCandidate;
    }
  }

  return bestCandidate?.value;
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

  const parsed = tryParseStructuredJson(trimmed);
  if (parsed === undefined) {
    throw new Error('experimental_subAgent() expected valid JSON output for structured response.');
  }

  return {
    result: null,
    structuredOutput: validateStructuredOutput(parsed, options),
  };
};
