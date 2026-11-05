import util from 'node:util';
import { Effect, Result } from 'effect';
import { commandHintStep } from 'src/services/command-hints';
import type { TerminalUI } from 'src/services/terminal-ui';
import { normalizeFileUploadSchema } from 'src/services/tool-file-uploads';
import type { InstantCharge } from 'src/services/tools-executor';
import { redact } from 'src/ui/redact';
import { isPlainRecord } from 'src/utils/parse-json';

export const connectionTips = (params: {
  readonly toolkit: string | undefined;
  readonly toolSlug: string;
  readonly surface: 'root' | 'dev';
}) => {
  const { toolkit, toolSlug, surface } = params;
  const executeStep =
    surface === 'dev'
      ? commandHintStep('Retry', 'dev.playgroundExecute', {
          slug: toolSlug,
          userId: '<user-id>',
          data: '...',
        })
      : commandHintStep('Retry', 'root.execute', { slug: toolSlug, data: '...' });
  if (!toolkit) {
    return executeStep;
  }
  return [
    commandHintStep(
      'Link the toolkit first',
      surface === 'dev' ? 'dev.connectedAccounts.link' : 'root.link',
      surface === 'dev' ? { toolkit, userId: '<user-id>' } : { toolkit }
    ),
    executeStep.replace('Retry:', 'Then retry:'),
  ].join('\n');
};

export const ciRedactReplacer = (_key: string, value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  if (_key === 'logId') return redact({ value, prefix: 'log_' });
  if (_key === 'id' || _key.endsWith('Id') || _key.endsWith('_id')) {
    return redact({ value });
  }
  return value;
};

// JSON.stringify throws synchronously on circular or BigInt-bearing API
// payloads; fall back to util.inspect so the formatter stays a plain string
// function for its callers.
export const formatUnknownObject = (value: object): string =>
  Result.getOrElse(
    Result.try(() => JSON.stringify(value, null, 2)),
    () => util.inspect(value, { depth: 5, breakLength: 120 })
  );

export const redactRequestId = (value: object): object => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  if (!isPlainRecord(value)) return value;
  const requestId = value.request_id;
  if (typeof requestId !== 'string') {
    return value;
  }
  return {
    ...value,
    request_id: redact({ value: requestId }),
  };
};

export const describeStoredOutputSize = ({
  sizeBytes,
  tokenCount,
}: {
  readonly sizeBytes: number;
  readonly tokenCount: number;
}): string => `${Math.ceil(sizeBytes / 1024)} KB, ~${tokenCount} tokens`;

export const serializeExecuteOutput = (result: unknown): string =>
  JSON.stringify(result, ciRedactReplacer, 2);

const permissionApprovalLabel = (approval?: string): string | undefined => {
  switch (approval) {
    case 'always_approved':
      return 'always approved';
    case 'cached_approved':
      return 'cached approved';
    case 'approved_once':
      return 'approved once';
    case 'approved_for_session':
      return 'approved for session';
    default:
      return undefined;
  }
};

const instantChargeLabel = (charge?: InstantCharge): string | undefined => {
  if (!charge) return undefined;
  return `instant charge: ${charge.amount} ${charge.currency}`;
};

export const executionSuccessSuffix = (result: {
  readonly logId?: string;
  readonly permissionApproval?: string;
  readonly instantCharge?: InstantCharge;
}) => {
  const metadata = [
    permissionApprovalLabel(result.permissionApproval),
    instantChargeLabel(result.instantCharge),
    result.logId ? `logId: ${redact({ value: result.logId, prefix: 'log_' })}` : undefined,
  ].filter((value): value is string => Boolean(value));
  return metadata.length > 0 ? ` (${metadata.join(', ')})` : '';
};

export const writeExecuteStdout = (ui: TerminalUI, data: string) =>
  ui.output(data, { force: true });

export type DryRunSummary = {
  readonly successful: true;
  readonly dryRun: true;
  readonly slug: string;
  readonly arguments: Record<string, unknown>;
  readonly userId: string;
  readonly schemaPath?: string;
  readonly schemaVersion?: string | null;
};

export const emitCachedSchema = (
  ui: TerminalUI,
  slug: string,
  definition: {
    readonly version: string | null;
    readonly schemaPath: string;
    readonly schema: Record<string, unknown>;
  }
) =>
  Effect.gen(function* () {
    const displaySchema = normalizeFileUploadSchema(definition.schema);
    yield* ui.log.message(
      `Schema saved, inspect keys like: jq '{required: (.inputSchema.required // []), keys: (.inputSchema.properties | keys)}' ${definition.schemaPath}`
    );
    yield* writeExecuteStdout(
      ui,
      JSON.stringify(
        {
          slug,
          version: definition.version,
          schemaPath: definition.schemaPath,
          inputSchema: displaySchema,
        },
        null,
        2
      )
    );
  });
