import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import { Effect } from 'effect';
import type { AgentHost } from './agent-host';
import { hostConfigDirectory, rawHostEnvironment } from './agent-host-env';
import { NodeOs } from './node-os';

export interface HostInstallationSignals {
  readonly configDirPresent: boolean;
  readonly binaryInKnownPaths: boolean;
}

const HOME_RELATIVE_BINARY_DIRS: Readonly<Record<AgentHost, ReadonlyArray<ReadonlyArray<string>>>> =
  {
    claude: [
      ['.claude', 'local'],
      ['.local', 'bin'],
      ['.npm-global', 'bin'],
    ],
    codex: [
      ['.local', 'bin'],
      ['.npm-global', 'bin'],
    ],
  };

const ABSOLUTE_BINARY_DIRS = ['/usr/local/bin', '/opt/homebrew/bin'] as const;

/**
 * Cheap on-disk signals that tell a real host absence apart from a PATH miss
 * when `<host> --version` cannot be spawned.
 */
export const probeHostInstallation = (host: AgentHost) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const os = yield* NodeOs;
    const env = yield* rawHostEnvironment;
    const exists = (target: string) => fs.exists(target).pipe(Effect.orElseSucceed(() => false));

    const configDir = hostConfigDirectory({ host, env, homedir: os.homedir, join: path.join });
    const binaries = [
      ...HOME_RELATIVE_BINARY_DIRS[host].map(segments => path.join(os.homedir, ...segments, host)),
      ...ABSOLUTE_BINARY_DIRS.map(dir => path.join(dir, host)),
    ];
    const configDirPresent = yield* exists(configDir);
    const found = yield* Effect.forEach(binaries, exists);
    return {
      configDirPresent,
      binaryInKnownPaths: found.includes(true),
    } satisfies HostInstallationSignals;
  });
