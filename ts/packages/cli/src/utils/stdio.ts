import process from 'node:process';

export type TtyLikeStream = {
  readonly isTTY?: boolean;
};

export type InteractiveStdio = {
  readonly stdin?: TtyLikeStream;
  readonly stdout?: TtyLikeStream;
  readonly stderr?: TtyLikeStream;
};

/**
 * True only when the CLI is attached to a human terminal for input, data output,
 * and decoration output. Agent/shell pipelines typically fail at least one of
 * these checks, so human-only prompts/notices should stay silent there.
 */
export const isInteractiveTerminal = (stdio: InteractiveStdio = {}): boolean => {
  const stdin = stdio.stdin ?? process.stdin;
  const stdout = stdio.stdout ?? process.stdout;
  const stderr = stdio.stderr ?? process.stderr;

  return Boolean(stdin.isTTY && stdout.isTTY && stderr.isTTY);
};
