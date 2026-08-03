import { Command, Options } from '@effect/cli';
import { FileSystem, Path } from '@effect/platform';
import type { PlatformError } from '@effect/platform/Error';
import { Array as Arr, Config, ConfigProvider, Effect, Option } from 'effect';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { TerminalUI } from 'src/services/terminal-ui';
import { getCompletionScript } from 'src/effects/shell-completions';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const completionsOpt = Options.boolean('completions').pipe(
  Options.withDescription('Install shell completions.'),
  Options.withDefault(false)
);

const noCompletionsOpt = Options.boolean('no-completions').pipe(
  Options.withDescription('Deprecated: shell completions are skipped by default.'),
  Options.withDefault(false)
);

const SHELLS = ['zsh', 'bash', 'fish'] as const;

const shellOpt = Options.choice('shell', SHELLS).pipe(
  Options.withDescription('Override automatic shell detection.'),
  Options.optional
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Shell = (typeof SHELLS)[number];

interface ShellConfig {
  readonly shell: Shell;
  readonly pathFiles: readonly string[];
  readonly completionFile: string;
  readonly pathBlock: string;
  readonly completionBlock: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MARKER = '# Composio CLI';
const COMPLETIONS_MARKER = '# Composio CLI completions';

/** Reject bin-dir paths containing shell metacharacters to prevent injection into rc files. */
const UNSAFE_PATH_CHARS = /[:;`$|&"'()\n\r\\]/;
const isUnsafePath = (p: string): boolean => UNSAFE_PATH_CHARS.test(p);

// SHELL, PATH, and COMPOSIO_BIN_DIR are read from the literal environment: SHELL
// and PATH are POSIX-standard (no app prefix applies to them), and COMPOSIO_BIN_DIR
// is already the full env var name, not a suffix the app's `COMPOSIO_`-prefixing
// ambient config provider should prefix again. Read them from a raw provider
// instead (precedent: `src/analytics/dispatch.ts`'s `environmentProvider`).
const environmentProvider = ConfigProvider.fromEnv();

/** Read an optional env var from the raw environment; provider errors die rather than fail the command. */
const readOptionalEnv = (name: string): Effect.Effect<string | undefined> =>
  Effect.orDie(
    environmentProvider.load(
      Config.option(Config.string(name)).pipe(Config.map(Option.getOrUndefined))
    )
  );

/** Read an env var from the raw environment, falling back when unset. */
const readEnvWithDefault = (name: string, fallback: string): Effect.Effect<string> =>
  Effect.orDie(environmentProvider.load(Config.string(name).pipe(Config.withDefault(fallback))));

const detectShellFromEnv = (path: Path.Path, shellEnv: string): Shell | undefined => {
  const base = path.basename(shellEnv);
  if (base === 'zsh') return 'zsh';
  if (base === 'bash') return 'bash';
  if (base === 'fish') return 'fish';
  return undefined;
};

const isDirOnPath = (pathEnv: string, dir: string): boolean =>
  pathEnv.split(':').some(entry => entry === dir);

/**
 * Bin-dir resolution order: explicit env, then `~/.local/bin` when it already
 * holds a `composio` entry point, then the real binary's own directory.
 */
const resolveBinDir = (params: {
  readonly envBinDir: string | undefined;
  readonly localBinDir: string;
  readonly localBinComposioExists: boolean;
  readonly execPath: string;
  readonly path: Path.Path;
}): string => {
  const trimmedEnvBinDir = params.envBinDir?.trim();
  if (trimmedEnvBinDir && trimmedEnvBinDir.length > 0) {
    return trimmedEnvBinDir;
  }
  if (params.localBinComposioExists) {
    return params.localBinDir;
  }
  return params.path.dirname(params.execPath);
};

/**
 * Render a path for embedding in a shell rc file. `~` never expands inside
 * double quotes, so home-relative paths use a literal `$HOME` prefix instead.
 */
const renderWithHome = (dir: string, homedir: string): string =>
  dir === homedir
    ? '$HOME'
    : dir.startsWith(`${homedir}/`)
      ? `$HOME/${dir.slice(homedir.length + 1)}`
      : dir;

const pathBlockForShell = (shell: Shell, binDir: string, homedir: string): string => {
  const rendered = renderWithHome(binDir, homedir);
  return shell === 'fish'
    ? [MARKER, `set --export PATH "${rendered}" $PATH`].join('\n')
    : [MARKER, `export PATH="${rendered}:$PATH"`].join('\n');
};

/** Bash startup-file candidates that only bash's login mode reads, in read order. */
const bashLoginOverrideCandidates = (path: Path.Path, homedir: string): string[] => [
  path.join(homedir, '.bash_profile'),
  path.join(homedir, '.bash_login'),
];

/**
 * First existing bash login-override file, if any. `bash -ilc` reads only the
 * first of `.bash_profile`, `.bash_login`, `.profile` that exists — so an
 * existing override shadows `.profile` and common `.profile` files source
 * `.bashrc`, unless the PATH line also lands in the override. `.profile` is
 * deliberately not a candidate below: when neither override exists, bash reads
 * `.profile` itself, and common `.profile` files already source `.bashrc`, so
 * nothing needs to be written to it.
 */
const resolveBashLoginOverride = (
  candidates: readonly string[],
  fs: FileSystem.FileSystem
): Effect.Effect<string | undefined, PlatformError> =>
  Effect.gen(function* () {
    for (const candidate of candidates) {
      if (yield* fs.exists(candidate)) return candidate;
    }
    return undefined;
  });

const pathFilesForShell = (
  path: Path.Path,
  shell: Shell,
  homedir: string,
  bashLoginOverride: string | undefined
): string[] => {
  switch (shell) {
    case 'zsh':
      return [path.join(homedir, '.zshrc')];
    case 'fish':
      return [path.join(homedir, '.config', 'fish', 'config.fish')];
    case 'bash': {
      const bashrc = path.join(homedir, '.bashrc');
      return bashLoginOverride ? [bashrc, bashLoginOverride] : [bashrc];
    }
  }
};

const buildShellConfig = (
  path: Path.Path,
  shell: Shell,
  pathFiles: readonly string[],
  binDir: string,
  completionScript: string | undefined,
  homedir: string
): ShellConfig => ({
  shell,
  pathFiles,
  completionFile:
    shell === 'fish'
      ? path.join(homedir, '.config', 'fish', 'completions', 'composio.fish')
      : pathFiles[0]!,
  pathBlock: pathBlockForShell(shell, binDir, homedir),
  completionBlock: completionScript ? `${COMPLETIONS_MARKER}\n${completionScript}` : undefined,
});

/** Check whether a file already contains a given marker line. */
const fileContains = (contents: string, marker: string): boolean =>
  contents.split('\n').some(line => line.trim() === marker.trim());

/** Outcome of reconciling a startup file's managed PATH block against the resolved bin dir. */
type ManagedPathBlockState =
  | { readonly state: 'absent' }
  | { readonly state: 'current' }
  | { readonly state: 'stale'; readonly reconciled: string };

const isAnyMarkerLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed === MARKER || trimmed === COMPLETIONS_MARKER;
};

/**
 * Reconcile the managed PATH block — the `MARKER` line plus the PATH
 * assignment right below it — with the currently resolved bin directory.
 * A block recording a stale bin dir is replaced in place, duplicate managed
 * PATH blocks collapse into a single current block, and unmanaged content
 * (including the completions block) is left byte-for-byte untouched.
 */
const reconcileManagedPathBlock = (contents: string, pathBlock: string): ManagedPathBlockState => {
  const lines = contents.split('\n');
  const markerIndexes = lines.flatMap((line, index) => (line.trim() === MARKER ? [index] : []));
  const firstMarkerIndex = markerIndexes[0];
  if (firstMarkerIndex === undefined) return { state: 'absent' };

  const expectedAssignment = (pathBlock.split('\n')[1] ?? '').trim();
  if (
    markerIndexes.length === 1 &&
    (lines[firstMarkerIndex + 1] ?? '').trim() === expectedAssignment
  ) {
    return { state: 'current' };
  }

  // Managed lines: each marker line and its assignment line, unless that next
  // line is itself a marker (never consume the completions block).
  const managedLineIndexes = new Set<number>(
    markerIndexes.flatMap(markerIndex => {
      const assignment = lines[markerIndex + 1];
      return assignment !== undefined && !isAnyMarkerLine(assignment)
        ? [markerIndex, markerIndex + 1]
        : [markerIndex];
    })
  );

  const reconciledLines = lines.flatMap((line, index) => {
    if (index === firstMarkerIndex) return pathBlock.split('\n');
    return managedLineIndexes.has(index) ? [] : [line];
  });
  return { state: 'stale', reconciled: reconciledLines.join('\n') };
};

interface ManagedBlockReplacement {
  readonly contents: string;
  readonly displayPath: string;
}

interface PathBlockWritePlan {
  readonly appendPathFiles: readonly string[];
  readonly replacementsByTarget: ReadonlyMap<string, ManagedBlockReplacement>;
  readonly loginOverrideWritten: boolean;
}

/**
 * Decide, per configured PATH file, whether the managed block must be appended
 * (absent), replaced in place (stale bin dir), or left alone (already
 * current). Both appends and replacements are deduplicated by physical write
 * target so two logical paths aliasing the same file (a dotfiles symlink
 * setup) keep exactly one managed block.
 */
const planPathBlockWrites = (params: {
  readonly pathFiles: readonly string[];
  readonly existingByFile: ReadonlyMap<string, string>;
  readonly pathFileTargets: ReadonlyMap<string, string>;
  readonly pathBlock: string;
  readonly bashLoginOverride: string | undefined;
  readonly skipPathWriteForReachability: boolean;
}): PathBlockWritePlan => {
  const appendPathFiles: string[] = [];
  const replacementsByTarget = new Map<string, ManagedBlockReplacement>();
  const queuedPathTargets = new Set<string>();
  let loginOverrideWritten = false;
  for (const filePath of params.pathFiles) {
    const existing = params.existingByFile.get(filePath) ?? '';
    const target = params.pathFileTargets.get(filePath)!;
    const reconciliation = reconcileManagedPathBlock(existing, params.pathBlock);
    if (reconciliation.state === 'stale') {
      if (!replacementsByTarget.has(target)) {
        replacementsByTarget.set(target, {
          contents: reconciliation.reconciled,
          displayPath: filePath,
        });
        if (filePath === params.bashLoginOverride) loginOverrideWritten = true;
      }
      continue;
    }
    if (
      reconciliation.state === 'current' ||
      params.skipPathWriteForReachability ||
      queuedPathTargets.has(target)
    ) {
      continue;
    }
    appendPathFiles.push(filePath);
    queuedPathTargets.add(target);
    if (filePath === params.bashLoginOverride) loginOverrideWritten = true;
  }
  return { appendPathFiles, replacementsByTarget, loginOverrideWritten };
};

/** Atomically rewrite each reconciled physical target, preserving its file mode. */
const writeReconciledTargets = (params: {
  readonly replacementsByTarget: ReadonlyMap<string, ManagedBlockReplacement>;
  readonly fs: FileSystem.FileSystem;
  readonly homedir: string;
  readonly report: (message: string) => Effect.Effect<void>;
}): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    for (const [writeTarget, replacement] of params.replacementsByTarget.entries()) {
      const existingTargetInfo = yield* params.fs.stat(writeTarget).pipe(Effect.option);
      const tmpPath = `${writeTarget}.composio-tmp`;

      yield* params.fs.writeFileString(tmpPath, replacement.contents);
      if (Option.isSome(existingTargetInfo)) {
        yield* params.fs.chmod(tmpPath, existingTargetInfo.value.mode & 0o7777);
      }
      yield* params.fs.rename(tmpPath, writeTarget);

      yield* params.report(`Updated ${tildify(replacement.displayPath, params.homedir)}`);
    }
  });

/** Completion status line, plus whether the completion block still needs appending. */
const planCompletionWrite = (params: {
  readonly shell: Shell;
  readonly completionsRequested: boolean;
  readonly completionBlock: string | undefined;
  readonly completionFile: string;
  readonly existingCompletionFile: string;
  readonly homedir: string;
}): { readonly statusLine: string; readonly append: boolean } => {
  if (params.shell === 'zsh') {
    return { statusLine: 'Completions: skipped for zsh', append: false };
  }
  if (!params.completionsRequested) {
    return {
      statusLine: 'Completions: skipped by default (pass --completions to enable)',
      append: false,
    };
  }
  if (!params.completionBlock) {
    return { statusLine: 'Completions: not available for this shell', append: false };
  }
  if (fileContains(params.existingCompletionFile, COMPLETIONS_MARKER)) {
    return { statusLine: 'Completions: already configured', append: false };
  }
  return {
    statusLine:
      params.shell === 'fish'
        ? `Completions: will install fish completions to ${tildify(params.completionFile, params.homedir)}`
        : 'Completions: will install shell completions',
    append: true,
  };
};

/** Status lines summarizing the planned PATH work, in print order. */
const pathStatusLines = (params: {
  readonly pathWritten: boolean;
  readonly pathReplaced: boolean;
  readonly skipPathWriteForReachability: boolean;
  readonly renderedBinDir: string;
}): readonly string[] => {
  const lines: string[] = [];
  if (params.pathWritten) lines.push(`PATH: will add ${params.renderedBinDir} to $PATH`);
  if (params.pathReplaced) {
    lines.push(`PATH: will update the managed block to ${params.renderedBinDir}`);
  }
  if (lines.length === 0) {
    lines.push(
      params.skipPathWriteForReachability
        ? 'PATH: already on $PATH — nothing to do.'
        : 'PATH: already configured'
    );
  }
  return lines;
};

/** Shell-specific body of the restart hint printed after a change. */
const restartHintBody = (params: {
  readonly shell: Shell;
  readonly zshPathFile: string;
  readonly bashrc: string;
  readonly bashLoginOverride: string | undefined;
  readonly loginOverrideWritten: boolean;
  readonly homedir: string;
}): string => {
  switch (params.shell) {
    case 'fish':
      return 'exec fish';
    case 'zsh':
      return `source ${tildify(params.zshPathFile, params.homedir)}`;
    case 'bash': {
      const hintLines = [`source ${tildify(params.bashrc, params.homedir)}`];
      if (params.loginOverrideWritten && params.bashLoginOverride) {
        hintLines.push(
          `${tildify(params.bashLoginOverride, params.homedir)} was also updated — that entry applies to new login shells too.`
        );
      }
      return hintLines.join('\n');
    }
  }
};

const tildify = (p: string, homedir: string): string =>
  p.startsWith(homedir + '/') ? `~/${p.slice(homedir.length + 1)}` : p;

const readMaybeMissingFile = (
  filePath: string,
  fs: FileSystem.FileSystem
): Effect.Effect<string, PlatformError> =>
  fs
    .readFileString(filePath)
    .pipe(
      Effect.catchAll(e =>
        Effect.logDebug('File does not exist yet, will create:', e).pipe(Effect.as(''))
      )
    );

/** Resolve valid symlink chains so atomic writes update the target instead of replacing the link. */
const resolveWriteTarget = (
  filePath: string,
  fs: FileSystem.FileSystem
): Effect.Effect<string, PlatformError> =>
  fs.readLink(filePath).pipe(
    Effect.flatMap(() => fs.realPath(filePath)),
    Effect.catchAll(() => Effect.succeed(filePath))
  );

// ---------------------------------------------------------------------------
// Exported logic (reusable from install.sh post-install delegation)
// ---------------------------------------------------------------------------

export const installShellIntegration = (params: {
  readonly completions: boolean;
  readonly shell?: Shell;
}): Effect.Effect<
  void,
  PlatformError,
  TerminalUI | NodeOs | NodeProcess | FileSystem.FileSystem | Path.Path | ComposioCliUserConfig
> =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const os = yield* NodeOs;
    const nodeProcess = yield* NodeProcess;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Everything this command prints is a report of what it changed on disk, so
    // it has to reach the user even when stderr is not a terminal: install.sh
    // runs it as a subprocess, and container/CI installs pipe the whole session
    // to a build log. Decoration stays the interactive default; `ui.error`
    // writes the same text unformatted when there is nothing to decorate.
    const { canDecorate } = yield* ui.capabilities;
    const plain = (prefix: string) => (message: string) => ui.error(`${prefix}${message}`);
    const step = canDecorate ? ui.log.step : ui.error;
    const success = canDecorate ? ui.log.success : ui.error;
    const warn = canDecorate ? ui.log.warn : plain('warning: ');
    const failure = canDecorate ? ui.log.error : plain('error: ');
    const note = (body: string, title: string) =>
      canDecorate ? ui.note(body, title) : ui.error(`${title}:\n${body}`);

    yield* ui.intro('composio install');

    const envBinDir = yield* readOptionalEnv('COMPOSIO_BIN_DIR');
    const localBinDir = path.join(os.homedir, '.local', 'bin');
    const localBinComposioExists = yield* fs.exists(path.join(localBinDir, 'composio'));
    const binDir = path.normalize(
      resolveBinDir({
        envBinDir,
        localBinDir,
        localBinComposioExists,
        execPath: nodeProcess.execPath,
        path,
      })
    );

    if (!path.isAbsolute(binDir)) {
      yield* failure('Resolved bin directory must be an absolute path.');
      yield* ui.outro('Aborted.');
      return;
    }

    if (isUnsafePath(binDir)) {
      yield* failure(
        'Resolved bin directory contains unsafe characters and cannot be written to shell config.'
      );
      yield* ui.outro('Aborted.');
      return;
    }

    // KD7 (final-block contract): when install.sh delegates to this command it
    // passes COMPOSIO_CLI_INVOCATION_ORIGIN=installer and owns the final action
    // block itself. Keep the concise per-file status lines but suppress the
    // boxed restart hint so the CLI never prints a competing instruction.
    const invocationOrigin = yield* readOptionalEnv('COMPOSIO_CLI_INVOCATION_ORIGIN');
    const installerOwnsFinalMessaging = invocationOrigin === 'installer';

    const isExplicitShell = params.shell !== undefined;
    const shellEnv = yield* readEnvWithDefault('SHELL', '');
    const shell = params.shell ?? detectShellFromEnv(path, shellEnv);

    const pathEnv = yield* readEnvWithDefault('PATH', '');
    const binDirOnPath = isDirOnPath(pathEnv, binDir);

    if (!shell) {
      if (binDirOnPath) {
        yield* success(`PATH: ${tildify(binDir, os.homedir)} is already on $PATH — nothing to do.`);
        yield* ui.outro('Done');
        return;
      }
      yield* warn('Could not detect your shell. Manually add the following to your shell config:');
      yield* note(`export PATH="${renderWithHome(binDir, os.homedir)}:$PATH"`, 'PATH setup');
      yield* ui.outro('Manual setup required.');
      return;
    }

    yield* step(`Detected shell: ${shell}`);

    // Generate completions script if requested.
    // Lazy-import the root command to avoid a circular dependency
    // (index.ts → install.cmd.ts → index.ts).
    let completionScript: string | undefined;
    if (params.completions && shell !== 'zsh') {
      const cliUserConfig = yield* ComposioCliUserConfig;
      const mod = yield* Effect.promise(() => import('src/commands'));
      const lines = yield* getCompletionScript(
        mod.buildRootCommand({
          isDevModeEnabled: cliUserConfig.isDevModeEnabled(),
          isExperimentalFeatureEnabled: feature =>
            cliUserConfig.isExperimentalFeatureEnabled(feature),
        }),
        shell
      );
      completionScript = lines.length > 0 ? Arr.join(lines, '\n') : undefined;
    }

    const bashLoginOverride =
      shell === 'bash'
        ? yield* resolveBashLoginOverride(bashLoginOverrideCandidates(path, os.homedir), fs)
        : undefined;
    const pathFiles = pathFilesForShell(path, shell, os.homedir, bashLoginOverride);
    const config = buildShellConfig(path, shell, pathFiles, binDir, completionScript, os.homedir);

    const uniqueTargetFiles = [...new Set([...config.pathFiles, config.completionFile])];
    const existingByFile = new Map<string, string>();
    for (const filePath of uniqueTargetFiles) {
      existingByFile.set(filePath, yield* readMaybeMissingFile(filePath, fs));
    }

    // Resolve each configured PATH file's real write target up front so two
    // logical paths that alias the same physical file (a dotfiles setup
    // symlinking .bash_profile -> .bashrc) get the PATH block appended once,
    // not once per alias.
    const pathFileTargets = new Map<string, string>();
    for (const filePath of config.pathFiles) {
      pathFileTargets.set(filePath, yield* resolveWriteTarget(filePath, fs));
    }

    const blocksByFile = new Map<string, Array<string>>();
    const pushBlock = (filePath: string, block: string) => {
      const blocks = blocksByFile.get(filePath);
      if (blocks) {
        blocks.push(block);
      } else {
        blocksByFile.set(filePath, [block]);
      }
    };

    // Auto-detected mode may skip the PATH write entirely when the bin dir is
    // already reachable; an explicit --shell always configures its files.
    // Only applies to a genuinely fresh install: if any target file already
    // carries our marker from a prior run, a file that appeared since then
    // (e.g. a freshly created .bash_profile) still needs its own write, even
    // though the invoking process's current $PATH already resolves.
    const anyPathFileAlreadyMarked = config.pathFiles.some(filePath =>
      fileContains(existingByFile.get(filePath) ?? '', MARKER)
    );
    const skipPathWriteForReachability =
      !isExplicitShell && binDirOnPath && !anyPathFileAlreadyMarked;
    const writePlan = planPathBlockWrites({
      pathFiles: config.pathFiles,
      existingByFile,
      pathFileTargets,
      pathBlock: config.pathBlock,
      bashLoginOverride,
      skipPathWriteForReachability,
    });
    const { replacementsByTarget, loginOverrideWritten } = writePlan;
    for (const filePath of writePlan.appendPathFiles) {
      pushBlock(filePath, config.pathBlock);
    }
    const pathWritten = writePlan.appendPathFiles.length > 0;

    yield* Effect.forEach(
      pathStatusLines({
        pathWritten,
        pathReplaced: replacementsByTarget.size > 0,
        skipPathWriteForReachability,
        renderedBinDir: tildify(binDir, os.homedir),
      }),
      step
    );

    const completionWrite = planCompletionWrite({
      shell,
      completionsRequested: params.completions,
      completionBlock: config.completionBlock,
      completionFile: config.completionFile,
      existingCompletionFile: existingByFile.get(config.completionFile) ?? '',
      homedir: os.homedir,
    });
    if (completionWrite.append && config.completionBlock) {
      pushBlock(config.completionFile, config.completionBlock);
    }
    yield* step(completionWrite.statusLine);

    // Reconcile stale managed blocks first so any completion append below
    // (which re-reads from disk) lands on top of the replaced contents.
    yield* writeReconciledTargets({
      replacementsByTarget,
      fs,
      homedir: os.homedir,
      report: success,
    });

    if (blocksByFile.size > 0) {
      for (const [filePath, blocks] of blocksByFile.entries()) {
        // Re-read instead of reusing the pre-check snapshot: two configured paths
        // can alias the same physical file through symlinks, and this write must
        // not discard a previous iteration's append.
        const existingContents = yield* readMaybeMissingFile(filePath, fs);
        // PATH files were already resolved above; only the completion file needs a fresh resolve.
        const writeTarget =
          pathFileTargets.get(filePath) ?? (yield* resolveWriteTarget(filePath, fs));
        const existingTargetInfo = yield* fs.stat(writeTarget).pipe(Effect.option);

        yield* fs
          .makeDirectory(path.dirname(writeTarget), { recursive: true })
          .pipe(
            Effect.catchAll(e =>
              Effect.logDebug('Could not create parent directory (may already exist):', e)
            )
          );

        const appendContent = '\n' + blocks.join('\n\n') + '\n';
        const tmpPath = `${writeTarget}.composio-tmp`;

        yield* fs.writeFileString(tmpPath, existingContents + appendContent);
        if (Option.isSome(existingTargetInfo)) {
          yield* fs.chmod(tmpPath, existingTargetInfo.value.mode & 0o7777);
        }
        yield* fs.rename(tmpPath, writeTarget);

        yield* success(`Updated ${tildify(filePath, os.homedir)}`);
      }
    }

    const changesWritten = blocksByFile.size > 0 || replacementsByTarget.size > 0;
    if (!changesWritten) {
      yield* success('Shell integration already configured — nothing to do.');
    }

    if (changesWritten && !installerOwnsFinalMessaging) {
      yield* note(
        restartHintBody({
          shell,
          zshPathFile: config.pathFiles[0]!,
          bashrc: path.join(os.homedir, '.bashrc'),
          bashLoginOverride,
          loginOverrideWritten,
          homedir: os.homedir,
        }),
        'Restart your shell to apply changes'
      );
    }

    yield* ui.outro('Done');
  });

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * CLI command to set up shell integration (PATH and completions).
 *
 * @example
 * ```bash
 * composio install
 * composio install --completions
 * composio install --no-completions
 * composio install --shell zsh
 * ```
 */
export const installCmd = Command.make(
  'install',
  { completions: completionsOpt, noCompletions: noCompletionsOpt, shell: shellOpt },
  ({ completions, noCompletions, shell }) =>
    installShellIntegration({
      completions: completions && !noCompletions,
      shell: Option.getOrUndefined(shell),
    })
).pipe(Command.withDescription('Set up shell integration (PATH and completions).'));
