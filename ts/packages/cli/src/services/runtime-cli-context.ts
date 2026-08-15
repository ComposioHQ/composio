import { Context, Effect, Layer, Option } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';

export const DEFAULT_CLI_INVOCATION_ORIGIN = 'cli';

export type CliInvocationContext = {
  readonly invocationOrigin: string;
  readonly parentRunId: string | undefined;
};

/**
 * Who invoked this CLI process, and under which parent run.
 *
 * Both values arrive as the `COMPOSIO_CLI_INVOCATION_ORIGIN` / `COMPOSIO_CLI_PARENT_RUN_ID`
 * handshake `composio run` and `install.sh` set on the processes they spawn, so `effect/Config`
 * already is their injection point: a test overrides them with a config provider.
 */
export const cliInvocationContext: Effect.Effect<CliInvocationContext> = Effect.all({
  invocationOrigin: APP_CONFIG.CLI_INVOCATION_ORIGIN,
  parentRunId: APP_CONFIG.CLI_PARENT_RUN_ID,
}).pipe(
  Effect.orDie,
  Effect.map(({ invocationOrigin, parentRunId }) => ({
    invocationOrigin: invocationOrigin ?? DEFAULT_CLI_INVOCATION_ORIGIN,
    parentRunId,
  }))
);

/**
 * Run id the bootstrap resolved for a `composio run` invocation.
 *
 * `cli-main.ts` mints it while building the run's telemetry context and hands it to the command,
 * so the `CLI_RUN_*` events and the `COMPOSIO_CLI_PARENT_RUN_ID` the script's child process
 * inherits carry the same id. `None` for every other command, and for callers that drive the root
 * command directly.
 */
export class CliRunId extends Context.Tag('services/CliRunId')<CliRunId, Option.Option<string>>() {}

export const cliRunIdLayer = (runId: string | undefined): Layer.Layer<CliRunId> =>
  Layer.succeed(CliRunId, Option.fromNullable(runId));
