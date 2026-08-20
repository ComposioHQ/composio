import { Command, Options } from '@effect/cli';
import { FileSystem, Path } from '@effect/platform';
import type { PlatformError } from '@effect/platform/Error';
import { Array as Arr, Config, ConfigProvider, Data, Effect, Option } from 'effect';
import { APP_CONFIG } from 'src/effects/app-config';
import { ComposioCliUserConfig } from 'src/services/cli-user-config';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { TerminalUI } from 'src/services/terminal-ui';
import { getCompletionScript } from 'src/effects/shell-completions';
import { atomicWriteFileString } from 'src/utils/atomic-write';

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

export type Shell = (typeof SHELLS)[number];

/**
 * Aborted shell setup must fail the process: install.sh only runs its guarded
 * inline PATH fallback when `composio install` exits non-zero, so a successful
 * exit here would leave the user with no PATH setup and a green install. The
 * abort reason is already printed before this error is raised; cli-main.ts
 * maps it to exit code 1 without printing anything further.
 */
export class ShellSetupAbortError extends Data.TaggedError('commands/ShellSetupAbortError')<{
  readonly message: string;
}> {}

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

/**
 * Reject bin-dir paths that cannot be embedded safely in a managed rc line.
 *
 * The resolved dir is only ever emitted inside double quotes — `export
 * PATH="<dir>:$PATH"` for bash/zsh and `set --export PATH "<dir>" $PATH` for
 * fish — so the set is deliberately narrow and mirrors `is_unsafe_path` in
 * install.sh, keeping the inline fallback and this command on one contract:
 *
 * - `` ` ``, `$`, `\`, `"`: the only characters bash and zsh still expand
 *   inside double quotes (`!` history expansion does not apply to sourced
 *   files). fish expands a strict subset of those. Everything else — `;`, `|`,
 *   `&`, `(`, `)`, `'` — is literal there, so a path like
 *   `/Users/o'brien/.composio` is written verbatim rather than rejected.
 * - `\n`, `\r`: structural, not a quoting concern — either would split the
 *   managed block into extra rc lines.
 * - `:`: structural too, as the PATH separator: a dir containing one would
 *   silently prepend more than one entry.
 */
const UNSAFE_PATH_CHARS = /[`$"\\\n\r:]/;
const isUnsafePath = (p: string): boolean => UNSAFE_PATH_CHARS.test(p);

// SHELL and PATH are POSIX-standard host variables, so the CLI's COMPOSIO_
// prefix does not apply to them.
const environmentProvider = ConfigProvider.fromEnv();

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
 * True when `candidate` resolves (following symlinks) to the running
 * executable. A bare exists-check is not enough for bin-dir resolution: a
 * leftover `composio` from another installer (e.g. pip) would win, and the
 * PATH line would point shells at the wrong program.
 */
const resolvesToCurrentExecutable = (
  candidate: string,
  execPath: string,
  fs: FileSystem.FileSystem
): Effect.Effect<boolean> =>
  Effect.zipWith(
    fs.realPath(candidate),
    fs.realPath(execPath).pipe(Effect.orElseSucceed(() => execPath)),
    (candidateReal, execReal) => candidateReal === execReal
  ).pipe(Effect.orElseSucceed(() => false));

/**
 * Bin-dir resolution order: explicit env, then `~/.local/bin` when its
 * `composio` entry point is the running executable, then the real binary's
 * own directory.
 */
const resolveBinDir = (params: {
  readonly envBinDir: string | undefined;
  readonly localBinDir: string;
  readonly localBinComposioIsCurrentExecutable: boolean;
  readonly execPath: string;
  readonly path: Path.Path;
}): string => {
  const trimmedEnvBinDir = params.envBinDir?.trim();
  if (trimmedEnvBinDir && trimmedEnvBinDir.length > 0) {
    return trimmedEnvBinDir;
  }
  if (params.localBinComposioIsCurrentExecutable) {
    return params.localBinDir;
  }
  return params.path.dirname(params.execPath);
};

/**
 * Render a path for embedding in a shell rc file. `~` never expands inside
 * double quotes, so home-relative paths use a literal `$HOME` prefix instead.
 * Must stay in lockstep with install.sh's render_bin_dir: the installer's
 * delegated_setup_verified compares its own rendering against the line this
 * command wrote byte for byte, so any disagreement makes every delegated
 * install look stale and forces a needless inline rewrite.
 */
export const renderWithHome = (dir: string, homedir: string): string =>
  dir === homedir
    ? '$HOME'
    : dir.startsWith(`${homedir}/`)
      ? `$HOME/${dir.slice(homedir.length + 1)}`
      : dir;

export const pathBlockForShell = (shell: Shell, binDir: string, homedir: string): string => {
  const rendered = renderWithHome(binDir, homedir);
  return shell === 'fish'
    ? [MARKER, `set --export PATH "${rendered}" $PATH`].join('\n')
    : [MARKER, `export PATH="${rendered}:$PATH"`].join('\n');
};

/**
 * The bash startup file a login shell reads the managed PATH block from, and
 * whether creating it means taking over from an existing `~/.profile`.
 */
interface BashLoginFile {
  readonly file: string;
  readonly seedsProfilePassthrough: boolean;
}

/**
 * Preamble for a `~/.bash_profile` this command creates. A login bash reads
 * `/etc/profile` and then only the first existing of `.bash_profile`,
 * `.bash_login`, `.profile`, so a newly created `.bash_profile` shadows a
 * `.profile` the shell read until now. Sourcing it back keeps that content —
 * including the Debian-style `.profile` that itself sources `.bashrc` — while
 * leaving `.profile` (shared with every other POSIX shell) untouched.
 */
const BASH_PROFILE_PASSTHROUGH = [
  '# Created by the Composio CLI installer.',
  '# Bash reads this file instead of ~/.profile in login shells.',
  'if [ -f "$HOME/.profile" ]; then',
  '    . "$HOME/.profile"',
  'fi',
].join('\n');

/**
 * Resolve the bash startup file that login-mode bash reads.
 *
 * Login bash never reads `.bashrc` — macOS Terminal.app starts exactly such a
 * shell — so the PATH block has to reach a login-mode file too. An existing
 * override (`.bash_profile`, then `.bash_login`) is reused; when neither
 * exists, `.bash_profile` is created rather than writing the shared
 * `.profile`, which a `.bash_profile` would shadow anyway.
 */
const resolveBashLoginFile = (
  path: Path.Path,
  homedir: string,
  fs: FileSystem.FileSystem
): Effect.Effect<BashLoginFile, PlatformError> =>
  Effect.gen(function* () {
    const bashProfile = path.join(homedir, '.bash_profile');
    if (yield* fs.exists(bashProfile)) {
      return { file: bashProfile, seedsProfilePassthrough: false };
    }
    const bashLogin = path.join(homedir, '.bash_login');
    if (yield* fs.exists(bashLogin)) {
      return { file: bashLogin, seedsProfilePassthrough: false };
    }
    const profileExists = yield* fs.exists(path.join(homedir, '.profile'));
    return { file: bashProfile, seedsProfilePassthrough: profileExists };
  });

/** Bash always configures both files: `.bashrc` for interactive shells, the login file for login shells. */
const pathFilesForShell = (
  path: Path.Path,
  shell: Shell,
  homedir: string,
  bashLoginFile: string | undefined
): string[] => {
  switch (shell) {
    case 'zsh':
      return [path.join(homedir, '.zshrc')];
    case 'fish':
      return [path.join(homedir, '.config', 'fish', 'config.fish')];
    case 'bash': {
      // Bash is the only shell here that splits startup files by mode: an
      // interactive non-login shell reads .bashrc, while a login shell (ssh,
      // macOS Terminal.app) reads only its login files. Writing .bashrc alone
      // would leave PATH unset in login shells whenever an override file
      // shadows .profile, so the block lands in both. The override also stays
      // a named value because the restart hint reports it separately.
      const bashrc = path.join(homedir, '.bashrc');
      return bashLoginFile ? [bashrc, bashLoginFile] : [bashrc];
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

/**
 * Check whether a file already contains a given marker line. Byte-exact, like
 * install.sh's awk `$0 == "# Composio CLI"` match: a marker mangled by CRLF
 * endings or stray whitespace is not ours and is left alone on both sides.
 */
const fileContains = (contents: string, marker: string): boolean =>
  contents.split('\n').some(line => line === marker);

/** Outcome of reconciling a startup file's managed PATH block against the resolved bin dir. */
type ManagedPathBlockState =
  | { readonly state: 'absent' }
  | { readonly state: 'current' }
  | { readonly state: 'stale'; readonly reconciled: string };

/**
 * A line this installer could have written as the managed PATH assignment:
 * POSIX `export PATH="<dir>:$PATH"` or fish `set --export PATH "<dir>" $PATH`.
 * Matched structurally on the prefix/suffix (any bin dir) so stale blocks
 * recording another directory are still recognized as ours.
 */
const isManagedPathAssignment = (line: string): boolean => {
  const trimmed = line.trim();
  return (
    (trimmed.startsWith('export PATH="') && trimmed.endsWith(':$PATH"')) ||
    (trimmed.startsWith('set --export PATH "') && trimmed.endsWith('" $PATH'))
  );
};

const LEGACY_POSIX_INSTALL_DIR_PREFIX = 'export COMPOSIO_INSTALL_DIR="';
const LEGACY_FISH_INSTALL_DIR_PREFIX = 'set --export COMPOSIO_INSTALL_DIR "';

/**
 * The install-dir assignment the previously released installer wrote as the
 * second line of its three-line managed block: POSIX
 * `export COMPOSIO_INSTALL_DIR="<dir>"` or fish
 * `set --export COMPOSIO_INSTALL_DIR "<dir>"`. Matched structurally on the
 * prefix/quotes (any dir), like `isManagedPathAssignment`.
 */
const isLegacyInstallDirAssignment = (line: string): boolean => {
  const trimmed = line.trim();
  return (
    (trimmed.startsWith(LEGACY_POSIX_INSTALL_DIR_PREFIX) &&
      trimmed.endsWith('"') &&
      trimmed.length > LEGACY_POSIX_INSTALL_DIR_PREFIX.length) ||
    (trimmed.startsWith(LEGACY_FISH_INSTALL_DIR_PREFIX) &&
      trimmed.endsWith('"') &&
      trimmed.length > LEGACY_FISH_INSTALL_DIR_PREFIX.length)
  );
};

/**
 * True when `first` and `second` are the two export lines of the legacy
 * three-line block, in the same shell dialect. The closing PATH line is
 * matched byte-for-byte (modulo surrounding whitespace) against the exact
 * text the legacy installer emitted, so anything else after an install-dir
 * assignment is user content and stays untouched.
 */
const isLegacyManagedPair = (first: string, second: string): boolean => {
  if (!isLegacyInstallDirAssignment(first)) return false;
  const secondTrimmed = second.trim();
  return first.trim().startsWith(LEGACY_POSIX_INSTALL_DIR_PREFIX)
    ? secondTrimmed === 'export PATH="$COMPOSIO_INSTALL_DIR:$PATH"'
    : secondTrimmed === 'set --export PATH $COMPOSIO_INSTALL_DIR $PATH';
};

/**
 * Append managed blocks after existing content, separated by one blank line
 * and ending with a newline. Content lacking a final newline gains one first,
 * exactly as install.sh's line-based awk rewrite normalizes it.
 */
export const appendManagedBlocks = (contents: string, blocks: readonly string[]): string => {
  const base = contents === '' || contents.endsWith('\n') ? contents : `${contents}\n`;
  return `${base}\n${blocks.join('\n\n')}\n`;
};

/**
 * Reconcile the managed PATH block — the `MARKER` line plus the PATH
 * assignment right below it — with the currently resolved bin directory.
 *
 * This mirrors install.sh's write_path_block awk program step for step, and
 * the shared fixtures under test/managed-block-fixtures pin both
 * implementations to byte-identical outputs — any behavioral edit here must
 * land in install.sh too. A file whose single byte-exact marker is directly
 * followed by the expected assignment is current and left untouched.
 * Otherwise every managed line — each marker, plus the next line only when it
 * is a recognizable managed PATH assignment, or the next two lines when they
 * are the exact export pair of the legacy three-line block (marker,
 * `export COMPOSIO_INSTALL_DIR=...`, PATH line, in POSIX or fish form);
 * anything else (a user annotation, a blank line, another marker) is not
 * ours to delete — is removed and one fresh block is appended after the
 * remaining content. No
 * user content is ever deleted, and because these prepend-style assignments
 * make the last-sourced line win, the new bin dir takes PATH precedence over
 * any orphaned stale assignment that had to be preserved.
 */
export const reconcileManagedPathBlock = (
  contents: string,
  pathBlock: string
): ManagedPathBlockState => {
  const lines = contents.split('\n');
  const markerIndexes = lines.flatMap((line, index) => (line === MARKER ? [index] : []));
  const firstMarkerIndex = markerIndexes[0];
  if (firstMarkerIndex === undefined) return { state: 'absent' };

  const blockLines = pathBlock.split('\n');
  if (markerIndexes.length === 1 && lines[firstMarkerIndex + 1] === blockLines[1]) {
    return { state: 'current' };
  }

  // Managed lines: each marker line, plus the next line only when it is a
  // recognizable managed PATH assignment, or the next two lines when they are
  // the exact export pair of the legacy three-line block — anything else is
  // not ours to delete.
  const managedLineIndexes = new Set<number>(
    markerIndexes.flatMap(markerIndex => {
      const assignment = lines[markerIndex + 1];
      if (assignment === undefined) return [markerIndex];
      if (isManagedPathAssignment(assignment)) return [markerIndex, markerIndex + 1];
      const legacyPathLine = lines[markerIndex + 2];
      if (legacyPathLine !== undefined && isLegacyManagedPair(assignment, legacyPathLine)) {
        return [markerIndex, markerIndex + 1, markerIndex + 2];
      }
      return [markerIndex];
    })
  );

  // Like the awk rewrite, kept content is a sequence of newline-terminated
  // lines: drop the split's trailing sentinel and re-terminate the last line.
  const keptLines = lines.filter((_, index) => !managedLineIndexes.has(index));
  const contentLines = keptLines[keptLines.length - 1] === '' ? keptLines.slice(0, -1) : keptLines;
  const kept = contentLines.length === 0 ? '' : contentLines.join('\n') + '\n';
  return { state: 'stale', reconciled: appendManagedBlocks(kept, [pathBlock]) };
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
    // Only a byte-exact current block is a no-op. A `$PATH` that already
    // resolves in the invoking process is deliberately not a reason to skip:
    // it is transient evidence that says nothing about future shells.
    if (reconciliation.state === 'current' || queuedPathTargets.has(target)) {
      continue;
    }
    appendPathFiles.push(filePath);
    queuedPathTargets.add(target);
    if (filePath === params.bashLoginOverride) loginOverrideWritten = true;
  }
  return { appendPathFiles, replacementsByTarget, loginOverrideWritten };
};

/**
 * Replace an rc file's contents via the shared atomic-write helper, preserving
 * the existing file's mode so a private rc stays private across the rewrite.
 */
const replaceFilePreservingMode = (
  fs: FileSystem.FileSystem,
  target: string,
  contents: string
): Effect.Effect<void, PlatformError> =>
  atomicWriteFileString({ fs, target, contents, preserveMode: true });

/** Append each file's queued blocks in one atomic, mode-preserving rewrite per file. */
const appendQueuedBlocks = (params: {
  readonly blocksByFile: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly pathFileTargets: ReadonlyMap<string, string>;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly homedir: string;
  readonly report: (message: string) => Effect.Effect<void>;
}): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    const { fs, path } = params;
    for (const [filePath, blocks] of params.blocksByFile.entries()) {
      // Re-read instead of reusing the pre-check snapshot: two configured paths
      // can alias the same physical file through symlinks, and this write must
      // not discard a previous iteration's append.
      const existingContents = yield* readMaybeMissingFile(filePath, fs);
      // PATH files were already resolved by the caller; only the completion
      // file needs a fresh resolve.
      const writeTarget =
        params.pathFileTargets.get(filePath) ?? (yield* resolveWriteTarget(filePath, fs));

      yield* fs
        .makeDirectory(path.dirname(writeTarget), { recursive: true })
        .pipe(
          Effect.catchAll(e =>
            Effect.logDebug('Could not create parent directory (may already exist):', e)
          )
        );

      yield* replaceFilePreservingMode(
        fs,
        writeTarget,
        appendManagedBlocks(existingContents, blocks)
      );
      yield* params.report(`Updated ${tildify(filePath, params.homedir)}`);
    }
  });

/** Atomically rewrite each reconciled physical target, preserving its file mode. */
const writeReconciledTargets = (params: {
  readonly replacementsByTarget: ReadonlyMap<string, ManagedBlockReplacement>;
  readonly fs: FileSystem.FileSystem;
  readonly homedir: string;
  readonly report: (message: string) => Effect.Effect<void>;
}): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    for (const [writeTarget, replacement] of params.replacementsByTarget.entries()) {
      yield* replaceFilePreservingMode(params.fs, writeTarget, replacement.contents);
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
  readonly renderedBinDir: string;
}): readonly string[] => {
  const lines: string[] = [];
  if (params.pathWritten) lines.push(`PATH: will add ${params.renderedBinDir} to $PATH`);
  if (params.pathReplaced) {
    lines.push(`PATH: will update the managed block to ${params.renderedBinDir}`);
  }
  if (lines.length === 0) lines.push('PATH: already configured');
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
  PlatformError | ShellSetupAbortError,
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

    // Resolve the entry-point bin dir: explicit env, then a ~/.local/bin/composio
    // that is this executable, then the runtime executable's own directory.
    const envBinDir = yield* APP_CONFIG.BIN_DIR.pipe(Effect.orDie);
    const localBinDir = path.join(os.homedir, '.local', 'bin');
    const execPath = nodeProcess.execPath;
    const localBinComposioIsCurrentExecutable = yield* resolvesToCurrentExecutable(
      path.join(localBinDir, 'composio'),
      execPath,
      fs
    );
    const binDir = path.normalize(
      resolveBinDir({
        envBinDir,
        localBinDir,
        localBinComposioIsCurrentExecutable,
        execPath,
        path,
      })
    );

    if (!path.isAbsolute(binDir)) {
      const message = 'Resolved bin directory must be an absolute path.';
      yield* failure(message);
      yield* ui.outro('Aborted.');
      return yield* new ShellSetupAbortError({ message });
    }

    if (isUnsafePath(binDir)) {
      const message =
        'Resolved bin directory contains unsafe characters and cannot be written to shell config.';
      yield* failure(message);
      yield* ui.outro('Aborted.');
      return yield* new ShellSetupAbortError({ message });
    }

    // The installer owns the closing message: when install.sh delegates to
    // this command it passes COMPOSIO_CLI_INVOCATION_ORIGIN=installer and
    // prints the final action block itself. Keep the concise per-file status
    // lines but suppress the boxed restart hint so the CLI never prints a
    // competing instruction.
    const invocationOrigin = yield* APP_CONFIG.CLI_INVOCATION_ORIGIN.pipe(Effect.orDie);
    const installerOwnsFinalMessaging = invocationOrigin === 'installer';

    const shellEnv = yield* readEnvWithDefault('SHELL', '');
    const shell = params.shell ?? detectShellFromEnv(path, shellEnv);

    const pathEnv = yield* readEnvWithDefault('PATH', '');
    const binDirOnPath = isDirOnPath(pathEnv, binDir);

    if (!shell) {
      // With no shell there is no rc file to write, so the current process's
      // $PATH is all the evidence available. It says nothing about future
      // shells, hence the deliberately hedged wording.
      if (binDirOnPath) {
        yield* success(
          `PATH: ${tildify(binDir, os.homedir)} is already on $PATH in this process, and no shell config file could be identified — nothing to update.`
        );
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

    const bashLoginFile =
      shell === 'bash' ? yield* resolveBashLoginFile(path, os.homedir, fs) : undefined;
    const bashLoginOverride = bashLoginFile?.file;
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

    const writePlan = planPathBlockWrites({
      pathFiles: config.pathFiles,
      existingByFile,
      pathFileTargets,
      pathBlock: config.pathBlock,
      bashLoginOverride,
    });
    const { replacementsByTarget, loginOverrideWritten } = writePlan;
    // A `.bash_profile` created here takes over from an existing `~/.profile`,
    // so it leads with the passthrough that keeps sourcing it.
    if (
      bashLoginFile?.seedsProfilePassthrough === true &&
      writePlan.appendPathFiles.includes(bashLoginFile.file)
    ) {
      pushBlock(bashLoginFile.file, BASH_PROFILE_PASSTHROUGH);
    }
    for (const filePath of writePlan.appendPathFiles) {
      pushBlock(filePath, config.pathBlock);
    }
    const pathWritten = writePlan.appendPathFiles.length > 0;

    yield* Effect.forEach(
      pathStatusLines({
        pathWritten,
        pathReplaced: replacementsByTarget.size > 0,
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

    yield* appendQueuedBlocks({
      blocksByFile,
      pathFileTargets,
      fs,
      path,
      homedir: os.homedir,
      report: success,
    });

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
 * The directory added to `PATH` is `COMPOSIO_BIN_DIR` when set — the documented
 * override an installer hands to this command — then `~/.local/bin` when its
 * `composio` entry point is this executable, then the running binary's own
 * directory.
 *
 * @example
 * ```bash
 * composio install
 * composio install --completions
 * composio install --no-completions
 * composio install --shell zsh
 * COMPOSIO_BIN_DIR=~/.local/bin composio install
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
).pipe(
  Command.withDescription(
    'Set up shell integration (PATH and completions). Set COMPOSIO_BIN_DIR to choose the directory added to PATH; it otherwise defaults to ~/.local/bin when that holds this executable, and to the directory of the running binary.'
  )
);
