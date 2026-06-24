import process from 'node:process';

export type TtyLikeStream = {
  readonly isTTY?: boolean;
};

export type InteractiveStdio = {
  readonly stdin?: TtyLikeStream;
  readonly stdout?: TtyLikeStream;
  readonly stderr?: TtyLikeStream;
};

const getStdio = (stdio: InteractiveStdio = {}) => ({
  stdin: stdio.stdin ?? process.stdin,
  stdout: stdio.stdout ?? process.stdout,
  stderr: stdio.stderr ?? process.stderr,
});

/**
 * True only when the CLI is attached to a human terminal for input, data output,
 * and decoration output. Agent/shell pipelines typically fail at least one of
 * these checks, so human-only prompts/notices should stay silent there.
 */
export const isInteractiveTerminal = (stdio: InteractiveStdio = {}): boolean => {
  const { stdin, stdout, stderr } = getStdio(stdio);

  return Boolean(stdin.isTTY && stdout.isTTY && stderr.isTTY);
};

/**
 * True when stderr can render terminal decoration such as logs, notes, and
 * spinners. Unlike prompts/notices, decoration only needs stderr; stdout can
 * remain clean for JSON/data and stdin can be redirected from /dev/null.
 */
export const canRenderTerminalDecoration = (stdio: InteractiveStdio = {}): boolean => {
  const { stderr } = getStdio(stdio);

  return Boolean(stderr.isTTY);
};
