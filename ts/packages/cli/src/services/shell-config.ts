/**
 * Shell startup files and the managed blocks `composio install` keeps in them: which shell is
 * running, which rc files it reads, the exact PATH and completion blocks to write, and how a
 * stale block is reconciled in place.
 *
 * install.sh carries an inline copy of the same contract for when the CLI cannot run. The
 * shared fixtures under test/managed-block-fixtures pin both implementations to byte-identical
 * output, so a behavioral edit here must land in install.sh too.
 */
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import type { PlatformError } from 'effect/PlatformError';
import { Array as Arr, Effect, Option } from 'effect';
import { atomicWriteFileString } from 'src/utils/atomic-write';

export const SHELLS = ['zsh', 'bash', 'fish'] as const;

export type Shell = (typeof SHELLS)[number];

export interface ShellConfig {
  readonly shell: Shell;
  readonly pathFiles: readonly string[];
  readonly completionFile: string;
  readonly pathBlock: string;
  readonly completionBlock: Option.Option<string>;
}

export const MARKER = '# Composio CLI';
export const COMPLETIONS_MARKER = '# Composio CLI completions';

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
export const isUnsafePath = (p: string): boolean => UNSAFE_PATH_CHARS.test(p);

/** The supported shell named by `$SHELL`'s basename, if any. */
export const detectShellFromEnv = (path: Path.Path, shellEnv: string): Option.Option<Shell> => {
  const base = path.basename(shellEnv);
  return Arr.findFirst(SHELLS, shell => shell === base);
};

/**
 * Render a path for embedding in a shell rc file. `~` never expands inside
 * double quotes, so home-relative paths use a literal `$HOME` prefix instead.
 * Must stay in lockstep with install.sh's render_bin_dir: the installer's
 * delegated_setup_verified compares its own rendering against the line this
 * command wrote byte for byte, so any disagreement makes every delegated
 * install look stale and forces a needless inline rewrite.
 */
export const renderWithHome = (dir: string, homedir: string): string => {
  if (dir === homedir) return '$HOME';
  if (dir.startsWith(`${homedir}/`)) return `$HOME/${dir.slice(homedir.length + 1)}`;
  return dir;
};

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
export interface BashLoginFile {
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
export const BASH_PROFILE_PASSTHROUGH = [
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
export const resolveBashLoginFile = (
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
export const pathFilesForShell = (
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

export const buildShellConfig = (
  path: Path.Path,
  shell: Shell,
  pathFiles: readonly string[],
  binDir: string,
  completionScript: Option.Option<string>,
  homedir: string
): ShellConfig => ({
  shell,
  pathFiles,
  completionFile:
    shell === 'fish'
      ? path.join(homedir, '.config', 'fish', 'completions', 'composio.fish')
      : pathFiles[0]!,
  pathBlock: pathBlockForShell(shell, binDir, homedir),
  completionBlock: Option.map(completionScript, script => `${COMPLETIONS_MARKER}\n${script}`),
});

/**
 * Check whether a file already contains a given marker line. Byte-exact, like
 * install.sh's awk `$0 == "# Composio CLI"` match: a marker mangled by CRLF
 * endings or stray whitespace is not ours and is left alone on both sides.
 */
export const fileContains = (contents: string, marker: string): boolean =>
  contents.split('\n').some(line => line === marker);

/** Outcome of reconciling a startup file's managed PATH block against the resolved bin dir. */
export type ManagedPathBlockState =
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
const isQuotedAssignment = (line: string, prefix: string): boolean =>
  line.startsWith(prefix) && line.endsWith('"') && line.length > prefix.length;

const isLegacyInstallDirAssignment = (line: string): boolean => {
  const trimmed = line.trim();
  return (
    isQuotedAssignment(trimmed, LEGACY_POSIX_INSTALL_DIR_PREFIX) ||
    isQuotedAssignment(trimmed, LEGACY_FISH_INSTALL_DIR_PREFIX)
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

/** The file's contents, or an empty string when it does not exist yet. */
export const readMaybeMissingFile = (
  filePath: string,
  fs: FileSystem.FileSystem
): Effect.Effect<string, PlatformError> =>
  fs
    .readFileString(filePath)
    .pipe(
      Effect.catch(e =>
        Effect.logDebug('File does not exist yet, will create:', e).pipe(Effect.as(''))
      )
    );

/** Resolve valid symlink chains so atomic writes update the target instead of replacing the link. */
export const resolveWriteTarget = (
  filePath: string,
  fs: FileSystem.FileSystem
): Effect.Effect<string, PlatformError> =>
  fs.readLink(filePath).pipe(
    Effect.flatMap(() => fs.realPath(filePath)),
    Effect.catch(() => Effect.succeed(filePath))
  );

/**
 * Replace an rc file's contents via the shared atomic-write helper, preserving
 * the existing file's mode so a private rc stays private across the rewrite.
 */
export const replaceFilePreservingMode = (
  fs: FileSystem.FileSystem,
  target: string,
  contents: string
): Effect.Effect<void, PlatformError> =>
  atomicWriteFileString({ fs, target, contents, preserveMode: true });
