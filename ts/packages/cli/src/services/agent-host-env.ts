import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { Config, ConfigProvider, Effect, Option } from 'effect';
import type { AgentHost } from './agent-host';
import { NodeOs } from './node-os';

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

export const hostConfigDirectory = (host: AgentHost) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const os = yield* NodeOs;
    const env = yield* rawHostEnvironment;
    if (host === 'claude') return env.claudeConfigDir ?? path.join(os.homedir, '.claude');
    return env.codexHome ?? path.join(os.homedir, '.codex');
  });

const KNOWN_BINARY_PATHS: Readonly<Record<AgentHost, ReadonlyArray<string>>> = {
  claude: [
    '.claude/local/claude',
    '.local/bin/claude',
    '.npm-global/bin/claude',
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ],
  codex: [
    '.local/bin/codex',
    '.npm-global/bin/codex',
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex',
  ],
};

export const probeHostInstallation = (host: AgentHost) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const os = yield* NodeOs;
    const exists = (target: string) => fs.exists(target).pipe(Effect.orElseSucceed(() => false));
    const configDirPresent = yield* exists(yield* hostConfigDirectory(host));
    const found = yield* Effect.forEach(KNOWN_BINARY_PATHS[host], entry =>
      exists(path.resolve(os.homedir, entry))
    );
    return { configDirPresent, binaryInKnownPaths: found.includes(true) };
  });
