import { Option } from 'effect';
import { createCliCommandTelemetryContext } from 'src/analytics/events';
import type { TelemetryFamily } from 'src/analytics/types';
import { resolveCommandMeta } from 'src/invocation/command-identity';
import {
  DEFAULT_CLI_INVOCATION_ORIGIN,
  type CliInvocationContext,
} from 'src/services/runtime-cli-context';

/**
 * The lifecycle telemetry context of `args` (argv after `composio`) run as the command
 * registration `path` of `family`, with the input `effect/cli` parsed for it. `input` omitted
 * means nothing was parsed, as for `--help`, `--version`, and parse failures.
 */
export const commandTelemetryContext = (
  args: ReadonlyArray<string>,
  options: {
    readonly path: ReadonlyArray<string>;
    readonly family?: TelemetryFamily;
    readonly input?: unknown;
    readonly cliVersion?: string;
    readonly terminal?: { readonly stdoutIsTTY: boolean; readonly stderrIsTTY: boolean };
    readonly invocation?: CliInvocationContext;
  }
) =>
  createCliCommandTelemetryContext({
    argv: ['/bin/bun', '/cli/bin.ts', ...args],
    cliVersion: options.cliVersion ?? '1.2.3',
    terminal: options.terminal ?? { stdoutIsTTY: false, stderrIsTTY: false },
    invocation: options.invocation ?? {
      invocationOrigin: DEFAULT_CLI_INVOCATION_ORIGIN,
      parentRunId: undefined,
    },
    identity: {
      path: options.path,
      meta: resolveCommandMeta(undefined, { telemetryFamily: options.family ?? 'command' }),
    },
    input: options.input === undefined ? Option.none() : Option.some(options.input),
    startedAt: Date.now(),
  });
