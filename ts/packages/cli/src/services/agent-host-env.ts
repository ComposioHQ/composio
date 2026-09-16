import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { Config, Effect, Option } from 'effect';
import type { AgentHost } from './agent-host';
import { loadHostConfig } from './config';
import { NodeOs } from './node-os';

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

const optionalRawEnv = (name: string) =>
  Config.option(Config.string(name)).pipe(Config.map(Option.getOrUndefined));

// Host-owned variables must bypass the CLI ConfigProvider, which prefixes
// application keys with COMPOSIO_. loadHostConfig builds a fresh
// ConfigProvider.fromEnv() per execution (v4's fromEnv snapshots the
// environment at build time), so live env changes and test stubs are
// always observed.
const HostEnvironmentConfig = Config.all({
  claudeCode: optionalRawEnv('CLAUDECODE'),
  codexThreadId: optionalRawEnv('CODEX_THREAD_ID'),
  codexSandbox: optionalRawEnv('CODEX_SANDBOX'),
  claudeConfigDir: optionalRawEnv('CLAUDE_CONFIG_DIR').pipe(Config.map(nonBlankOrUndefined)),
  codexHome: optionalRawEnv('CODEX_HOME').pipe(Config.map(nonBlankOrUndefined)),
});

export const rawHostEnvironment: Effect.Effect<RawHostEnvironment> =
  loadHostConfig(HostEnvironmentConfig);

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
