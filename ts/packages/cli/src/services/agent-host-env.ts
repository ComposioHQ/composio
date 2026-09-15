import { Config, ConfigProvider, Effect, Option } from 'effect';
import type { AgentHost } from './agent-host';

export type AgentHostEnv = AgentHost | 'none';

export interface HostEnvMarkers {
  readonly claudeCode: string | undefined;
  readonly codexThreadId: string | undefined;
  readonly codexSandbox: string | undefined;
}

export interface RawHostEnvironment extends HostEnvMarkers {
  readonly claudeConfigDir: string | undefined;
  readonly codexHome: string | undefined;
}

const isPresent = (value: string | undefined): boolean =>
  value !== undefined && value.trim().length > 0;

const nonBlankOrUndefined = (value: string | undefined): string | undefined => {
  if (!isPresent(value)) return undefined;
  return value;
};

export function detectPluginHost(markers: HostEnvMarkers): AgentHost | undefined {
  if (isPresent(markers.claudeCode)) return 'claude';
  if (isPresent(markers.codexThreadId) || isPresent(markers.codexSandbox)) return 'codex';
  return undefined;
}

export const agentHostEnvOf = (markers: HostEnvMarkers): AgentHostEnv =>
  detectPluginHost(markers) ?? 'none';

const readOptionalEnv = (name: string) =>
  Effect.orDie(Config.option(Config.string(name)).pipe(Config.map(Option.getOrUndefined)));

// Host-owned variables must bypass the CLI ConfigProvider, which prefixes
// application keys with COMPOSIO_. v4's fromEnv() snapshots the environment
// when the provider is built, so it is built per read.
export const rawHostEnvironment: Effect.Effect<RawHostEnvironment> = Effect.gen(function* () {
  const claudeCode = yield* readOptionalEnv('CLAUDECODE');
  const codexThreadId = yield* readOptionalEnv('CODEX_THREAD_ID');
  const codexSandbox = yield* readOptionalEnv('CODEX_SANDBOX');
  const claudeConfigDir = nonBlankOrUndefined(yield* readOptionalEnv('CLAUDE_CONFIG_DIR'));
  const codexHome = nonBlankOrUndefined(yield* readOptionalEnv('CODEX_HOME'));
  return { claudeCode, codexThreadId, codexSandbox, claudeConfigDir, codexHome };
}).pipe(
  Effect.provideServiceEffect(
    ConfigProvider.ConfigProvider,
    Effect.sync(() => ConfigProvider.fromEnv())
  )
);

export const hostConfigDirectory = (params: {
  readonly host: AgentHost;
  readonly env: RawHostEnvironment;
  readonly homedir: string;
  readonly join: (...segments: string[]) => string;
}): string => {
  if (params.host === 'claude') {
    return params.env.claudeConfigDir ?? params.join(params.homedir, '.claude');
  }
  return params.env.codexHome ?? params.join(params.homedir, '.codex');
};
