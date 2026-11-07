import { Effect } from 'effect';
import { APP_CONFIG } from 'src/config';
import { storeCliSessionArtifact } from 'src/services/cli-session-artifacts';
import type { InstantCharge, ToolExecuteResponse } from 'src/services/tools-executor';
import { serializeExecuteOutput } from './tools.execute.format';

// Responses larger than this are stored in a session file instead of printed,
// so a caller such as an agent does not take a huge payload into its context.
// Measured in UTF-8 bytes: about 10,000 tokens of JSON at the estimate below.
const EXECUTE_INLINE_OUTPUT_BYTE_THRESHOLD = 40_000;

// JSON averages roughly four bytes per token. The `tokenCount` of a stored
// response is this estimate rather than a tokenizer count, since the real count
// depends on the model that reads the file.
const ESTIMATED_BYTES_PER_OUTPUT_TOKEN = 4;

const shouldStoreLargeExecuteOutput = APP_CONFIG.CLI_INVOCATION_ORIGIN.pipe(
  Effect.orDie,
  Effect.map(origin => origin !== 'run')
);

type StoredExecuteOutputSummary = {
  readonly successful: true;
  readonly error: null;
  readonly logId: string;
  readonly instantCharge?: InstantCharge;
  readonly storedInFile: true;
  readonly tokenCount: number;
  readonly sizeBytes: number;
  readonly outputFilePath: string;
};

type PreparedExecuteOutput =
  | { readonly kind: 'inline'; readonly json: string }
  | { readonly kind: 'file'; readonly summary: StoredExecuteOutputSummary };

const persistLargeExecuteOutput = (
  toolSlug: string,
  json: string,
  sizeBytes: number,
  sharedDirectory?: string
) =>
  Effect.gen(function* () {
    const runOutputDirectory = yield* APP_CONFIG.RUN_OUTPUT_DIR;
    const outputFilePath = yield* storeCliSessionArtifact({
      contents: json,
      name: `${toolSlug}_OUTPUT`,
      extension: 'json',
      directoryPath: sharedDirectory?.trim() || runOutputDirectory,
    });

    return {
      successful: true,
      error: null,
      logId: '',
      storedInFile: true,
      tokenCount: Math.ceil(sizeBytes / ESTIMATED_BYTES_PER_OUTPUT_TOKEN),
      sizeBytes,
      outputFilePath: outputFilePath ?? '(could not write to disk)',
    } satisfies StoredExecuteOutputSummary;
  });

export const prepareExecuteOutput = (
  toolSlug: string,
  result: ToolExecuteResponse,
  sharedDirectory?: string
) =>
  Effect.gen(function* () {
    const json = serializeExecuteOutput(result);
    const sizeBytes = new TextEncoder().encode(json).length;
    // `composio run` always prints inline.
    if (
      sizeBytes <= EXECUTE_INLINE_OUTPUT_BYTE_THRESHOLD ||
      !(yield* shouldStoreLargeExecuteOutput)
    ) {
      return {
        kind: 'inline',
        json,
      } satisfies PreparedExecuteOutput;
    }

    return {
      kind: 'file',
      summary: {
        ...(yield* persistLargeExecuteOutput(toolSlug, json, sizeBytes, sharedDirectory)),
        logId: result.logId,
        ...(result.instantCharge ? { instantCharge: result.instantCharge } : {}),
      } satisfies StoredExecuteOutputSummary,
    } satisfies PreparedExecuteOutput;
  });
