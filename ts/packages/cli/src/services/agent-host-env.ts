import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { Effect, Option } from 'effect';
import { HOST_CONFIG, type AgentHostEnvironment } from 'src/config';
import type { AgentHost } from './agent-host';
import { NodeOs } from './node-os';

type HostEnvMarkers = Pick<AgentHostEnvironment, 'claudeCode' | 'codexThreadId' | 'codexSandbox'>;

// Blank markers already read as `undefined` (see `HOST_CONFIG`).
export function detectPluginHost(markers: HostEnvMarkers): AgentHost | undefined {
  if (markers.claudeCode !== undefined) return 'claude';
  if (markers.codexThreadId !== undefined || markers.codexSandbox !== undefined) return 'codex';
  return undefined;
}

export const rawHostEnvironment: Effect.Effect<AgentHostEnvironment> = Effect.orDie(
  HOST_CONFIG.AGENT_HOST
);

export const hostConfigDirectory = (host: AgentHost) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const os = yield* NodeOs;
    const env = yield* rawHostEnvironment;
    // Anchor relative overrides to the home directory so probe results
    // cannot depend on the process cwd; absolute overrides pass through.
    if (host === 'claude') return path.resolve(os.homedir, env.claudeConfigDir ?? '.claude');
    return path.resolve(os.homedir, env.codexHome ?? '.codex');
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
    // Presence means an actual directory: a file at the config path (or an
    // unreadable one) must not report the host as installed.
    const dirInfo = yield* Effect.option(fs.stat(yield* hostConfigDirectory(host)));
    const configDirPresent = Option.isSome(dirInfo) && dirInfo.value.type === 'Directory';
    const found = yield* Effect.forEach(KNOWN_BINARY_PATHS[host], entry =>
      exists(path.resolve(os.homedir, entry))
    );
    return { configDirPresent, binaryInKnownPaths: found.includes(true) };
  });
