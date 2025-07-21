import { Effect, Match, Data } from 'effect';
import { NodeOs } from '../services/node-os';

/**
 * Platform and architecture detection types
 */
export type PlatformArch = {
  platform: 'darwin' | 'linux';
  arch: 'x64' | 'aarch64';
};

export class UnsupportedPlatformError extends Data.TaggedError('UnsupportedPlatformError')<{
  readonly platform: string;
  readonly arch: string;
}> {}

/**
 * Detect current platform and architecture
 */
export const detectPlatform: Effect.Effect<PlatformArch, UnsupportedPlatformError, NodeOs> =
  Effect.gen(function* () {
    const nodeOs = yield* NodeOs;
    const rawPlatform = nodeOs.platform;
    const rawArch = nodeOs.arch;

    const platform: NodeJS.Platform = yield* Match.value(rawPlatform).pipe(
      Match.when('darwin', () => Effect.succeed('darwin' as const)),
      Match.when('linux', () => Effect.succeed('linux' as const)),
      Match.orElse(() =>
        Effect.fail(new UnsupportedPlatformError({ platform: rawPlatform, arch: rawArch }))
      )
    );

    const arch = yield* Match.value(rawArch).pipe(
      Match.when('x64', () => Effect.succeed('x64' as const)),
      Match.when('arm64', () => Effect.succeed('aarch64' as const)),
      Match.when('aarch64', () => Effect.succeed('aarch64' as const)),
      Match.orElse(() =>
        Effect.fail(new UnsupportedPlatformError({ platform: rawPlatform, arch: rawArch }))
      )
    );

    return { platform, arch };
  });
