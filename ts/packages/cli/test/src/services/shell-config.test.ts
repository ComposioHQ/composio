import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, Option } from 'effect';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import path from 'node:path';
import * as tempy from 'tempy';
import {
  buildShellConfig,
  detectShellFromEnv,
  isUnsafePath,
  pathBlockForShell,
  pathFilesForShell,
  renderWithHome,
  resolveBashLoginFile,
  type Shell,
} from 'src/services/shell-config';

const HOME = '/home/user';
const PlatformLive = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

describe('detectShellFromEnv', () => {
  it.effect.each([
    ['/bin/zsh', Option.some('zsh')],
    ['/usr/local/bin/bash', Option.some('bash')],
    ['/opt/homebrew/bin/fish', Option.some('fish')],
    ['zsh', Option.some('zsh')],
    ['/bin/sh', Option.none()],
    ['/usr/bin/nu', Option.none()],
    ['', Option.none()],
  ] as const)('$SHELL=%j detects %s', ([shellEnv, expected]) =>
    Effect.gen(function* () {
      const p = yield* Path.Path;
      expect(detectShellFromEnv(p, shellEnv)).toEqual(expected);
    }).pipe(Effect.provide(PlatformLive))
  );
});

describe('isUnsafePath', () => {
  it.each([
    ['/home/user/.local/bin', false],
    ["/Users/o'brien/.local/bin", false],
    ['/opt/a;b|c&(d)', false],
    ['/tmp/x$(evil)', true],
    ['/tmp/`evil`', true],
    ['/tmp/"quoted"', true],
    ['/tmp/back\\slash', true],
    ['/tmp/a:/b', true],
    ['/tmp/new\nline', true],
    ['/tmp/carriage\rreturn', true],
  ])('%j is unsafe: %s', (dir, expected) => {
    expect(isUnsafePath(dir)).toBe(expected);
  });
});

describe('renderWithHome', () => {
  it.each([
    [HOME, '$HOME'],
    [`${HOME}/.local/bin`, '$HOME/.local/bin'],
    [`${HOME}2/bin`, `${HOME}2/bin`],
    ['/usr/local/bin', '/usr/local/bin'],
  ])('%j renders as %j', (dir, expected) => {
    expect(renderWithHome(dir, HOME)).toBe(expected);
  });
});

describe('pathBlockForShell', () => {
  it.each<[Shell, string]>([
    ['zsh', '# Composio CLI\nexport PATH="$HOME/.local/bin:$PATH"'],
    ['bash', '# Composio CLI\nexport PATH="$HOME/.local/bin:$PATH"'],
    ['fish', '# Composio CLI\nset --export PATH "$HOME/.local/bin" $PATH'],
  ])('%s writes the managed marker and its PATH assignment', (shell, expected) => {
    expect(pathBlockForShell(shell, `${HOME}/.local/bin`, HOME)).toBe(expected);
  });
});

describe('pathFilesForShell and buildShellConfig', () => {
  it.effect('zsh configures ~/.zshrc and puts completions in the same file', () =>
    Effect.gen(function* () {
      const p = yield* Path.Path;
      const pathFiles = pathFilesForShell(p, 'zsh', HOME, undefined);
      expect(pathFiles).toEqual([`${HOME}/.zshrc`]);

      const config = buildShellConfig(p, 'zsh', pathFiles, '/opt/bin', Option.none(), HOME);
      expect(config.completionFile).toBe(`${HOME}/.zshrc`);
      expect(config.completionBlock).toEqual(Option.none());
    }).pipe(Effect.provide(PlatformLive))
  );

  it.effect('bash configures ~/.bashrc and its login file', () =>
    Effect.gen(function* () {
      const p = yield* Path.Path;
      expect(pathFilesForShell(p, 'bash', HOME, `${HOME}/.bash_login`)).toEqual([
        `${HOME}/.bashrc`,
        `${HOME}/.bash_login`,
      ]);
    }).pipe(Effect.provide(PlatformLive))
  );

  it.effect('fish keeps completions in their own file under a marker', () =>
    Effect.gen(function* () {
      const p = yield* Path.Path;
      const pathFiles = pathFilesForShell(p, 'fish', HOME, undefined);
      expect(pathFiles).toEqual([`${HOME}/.config/fish/config.fish`]);

      const config = buildShellConfig(
        p,
        'fish',
        pathFiles,
        '/opt/bin',
        Option.some('complete -c composio'),
        HOME
      );
      expect(config.completionFile).toBe(`${HOME}/.config/fish/completions/composio.fish`);
      expect(config.completionBlock).toEqual(
        Option.some('# Composio CLI completions\ncomplete -c composio')
      );
    }).pipe(Effect.provide(PlatformLive))
  );
});

describe('resolveBashLoginFile', () => {
  const resolveIn = (existing: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const p = yield* Path.Path;
      const home = tempy.temporaryDirectory({ prefix: 'shell-config' });
      yield* Effect.forEach(existing, file => fs.writeFileString(path.join(home, file), ''));
      const resolved = yield* resolveBashLoginFile(p, home, fs);
      return { ...resolved, file: path.relative(home, resolved.file) };
    }).pipe(Effect.provide(PlatformLive));

  it.effect.each([
    [[], { file: '.bash_profile', seedsProfilePassthrough: false }],
    [['.profile'], { file: '.bash_profile', seedsProfilePassthrough: true }],
    [['.bash_login'], { file: '.bash_login', seedsProfilePassthrough: false }],
    [['.bash_login', '.profile'], { file: '.bash_login', seedsProfilePassthrough: false }],
    [['.bash_profile', '.bash_login'], { file: '.bash_profile', seedsProfilePassthrough: false }],
    [['.bash_profile', '.profile'], { file: '.bash_profile', seedsProfilePassthrough: false }],
  ] as const)('with %j present resolves %j', ([existing, expected]) =>
    Effect.gen(function* () {
      expect(yield* resolveIn(existing)).toEqual(expected);
    })
  );
});
