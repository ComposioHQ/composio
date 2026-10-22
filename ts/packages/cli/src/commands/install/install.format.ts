import { Data } from 'effect';
import type { Effect } from 'effect';
import type { Shell } from 'src/services/shell-config';
import type { TerminalUI } from 'src/services/terminal-ui';

// `composio install` writes nothing to stdout: every line is a report on stderr of what it
// changed on disk.

export const INSTALL_INTRO = 'composio install';
export const DONE_OUTRO = 'Done';
export const ABORTED_OUTRO = 'Aborted.';
export const MANUAL_SETUP_OUTRO = 'Manual setup required.';

export const BIN_DIR_NOT_ABSOLUTE_MESSAGE = 'Resolved bin directory must be an absolute path.';
export const BIN_DIR_UNSAFE_MESSAGE =
  'Resolved bin directory contains unsafe characters and cannot be written to shell config.';

export const SHELL_NOT_DETECTED_MESSAGE =
  'Could not detect your shell. Manually add the following to your shell config:';
export const MANUAL_PATH_SETUP_TITLE = 'PATH setup';
export const ALREADY_CONFIGURED_MESSAGE = 'Shell integration already configured — nothing to do.';
export const RESTART_HINT_TITLE = 'Restart your shell to apply changes';

export const tildify = (p: string, homedir: string): string =>
  p.startsWith(homedir + '/') ? `~/${p.slice(homedir.length + 1)}` : p;

/**
 * With no shell there is no rc file to write, so the current process's `$PATH` is all the
 * evidence available. It says nothing about future shells, hence the deliberately hedged wording.
 */
export const alreadyOnPathMessage = (binDir: string, homedir: string) =>
  `PATH: ${tildify(binDir, homedir)} is already on $PATH in this process, and no shell config file could be identified — nothing to update.`;

/** The line a user without a detected shell adds by hand; `renderedBinDir` is `$HOME`-relative. */
export const manualPathSetupLine = (renderedBinDir: string) =>
  `export PATH="${renderedBinDir}:$PATH"`;

export const detectedShellMessage = (shell: Shell) => `Detected shell: ${shell}`;

export const updatedFileMessage = (filePath: string, homedir: string) =>
  `Updated ${tildify(filePath, homedir)}`;

/** Status lines summarizing the planned PATH work, in print order. */
export const pathStatusLines = (params: {
  readonly pathWritten: boolean;
  readonly pathReplaced: boolean;
  readonly renderedBinDir: string;
}): readonly string[] => {
  const lines = [
    ...(params.pathWritten ? [`PATH: will add ${params.renderedBinDir} to $PATH`] : []),
    ...(params.pathReplaced
      ? [`PATH: will update the managed block to ${params.renderedBinDir}`]
      : []),
  ];
  return lines.length > 0 ? lines : ['PATH: already configured'];
};

/** What happens to shell completions, decided before anything is written. */
export type CompletionPlan = Data.TaggedEnum<{
  /** zsh never gets a completion block. */
  SkippedForZsh: Record<never, never>;
  /** `--completions` was not passed, or `--no-completions` was. */
  NotRequested: Record<never, never>;
  /** The completion generator produced nothing for this shell. */
  Unavailable: Record<never, never>;
  /** The completion file already carries the completions marker. */
  AlreadyConfigured: Record<never, never>;
  /** Append `block` to the completion file. */
  Install: { readonly block: string };
}>;
export const CompletionPlan = Data.taggedEnum<CompletionPlan>();

/** The completions status line for `plan`. */
export const completionStatusLine = (
  plan: CompletionPlan,
  params: { readonly shell: Shell; readonly completionFile: string; readonly homedir: string }
): string =>
  CompletionPlan.$match(plan, {
    SkippedForZsh: () => 'Completions: skipped for zsh',
    NotRequested: () => 'Completions: skipped by default (pass --completions to enable)',
    Unavailable: () => 'Completions: not available for this shell',
    AlreadyConfigured: () => 'Completions: already configured',
    Install: () =>
      params.shell === 'fish'
        ? `Completions: will install fish completions to ${tildify(params.completionFile, params.homedir)}`
        : 'Completions: will install shell completions',
  });

/** Shell-specific body of the restart hint printed after a change. */
export const restartHintBody = (params: {
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
      const sourceLine = `source ${tildify(params.bashrc, params.homedir)}`;
      return params.loginOverrideWritten && params.bashLoginOverride
        ? [
            sourceLine,
            `${tildify(params.bashLoginOverride, params.homedir)} was also updated — that entry applies to new login shells too.`,
          ].join('\n')
        : sourceLine;
    }
  }
};

/** The stderr writers `composio install` reports through. */
export interface InstallReporter {
  readonly step: (message: string) => Effect.Effect<void>;
  readonly success: (message: string) => Effect.Effect<void>;
  readonly warn: (message: string) => Effect.Effect<void>;
  readonly failure: (message: string) => Effect.Effect<void>;
  readonly note: (body: string, title: string) => Effect.Effect<void>;
}

/**
 * Everything this command prints is a report of what it changed on disk, so
 * it has to reach the user even when stderr is not a terminal: install.sh
 * runs it as a subprocess, and container/CI installs pipe the whole session
 * to a build log. Decoration stays the interactive default; `ui.error`
 * writes the same text unformatted when there is nothing to decorate.
 */
export const makeInstallReporter = (ui: TerminalUI, canDecorate: boolean): InstallReporter => {
  const plain = (prefix: string) => (message: string) => ui.error(`${prefix}${message}`);
  return canDecorate
    ? {
        step: ui.log.step,
        success: ui.log.success,
        warn: ui.log.warn,
        failure: ui.log.error,
        note: (body, title) => ui.note(body, title),
      }
    : {
        step: ui.error,
        success: ui.error,
        warn: plain('warning: '),
        failure: plain('error: '),
        note: (body, title) => ui.error(`${title}:\n${body}`),
      };
};
