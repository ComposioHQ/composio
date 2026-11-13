import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, FileSystem, Option, Path } from 'effect';
import { resolveWindowsExecutable } from 'src/services/windows-executable';

const withPath = (entries: Record<string, string>) =>
  Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env: entries }));

describe('resolveWindowsExecutable', () => {
  it.effect('finds an npm command shim and marks it as needing a shell', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const empty = yield* fs.makeTempDirectoryScoped();
      const npmBin = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(npmBin, 'claude.cmd'), '@echo off');

      const resolved = yield* resolveWindowsExecutable('claude').pipe(
        withPath({ Path: `${empty};${npmBin}` })
      );

      expect(resolved).toEqual(
        Option.some({ path: path.join(npmBin, 'claude.cmd'), needsShell: true })
      );
    }).pipe(Effect.provide(BunServices.layer))
  );

  it.effect('prefers a native executable over a shim in the same directory', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const bin = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(bin, 'claude.cmd'), '@echo off');
      yield* fs.writeFileString(path.join(bin, 'claude.exe'), '');

      const resolved = yield* resolveWindowsExecutable('claude').pipe(withPath({ PATH: bin }));

      expect(resolved).toEqual(
        Option.some({ path: path.join(bin, 'claude.exe'), needsShell: false })
      );
    }).pipe(Effect.provide(BunServices.layer))
  );

  it.effect('finds nothing when the command is not on PATH', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const empty = yield* fs.makeTempDirectoryScoped();

      const resolved = yield* resolveWindowsExecutable('claude').pipe(withPath({ Path: empty }));

      expect(Option.isNone(resolved)).toBe(true);
    }).pipe(Effect.provide(BunServices.layer))
  );
});
