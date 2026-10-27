import type { Effect } from 'effect';

/**
 * What a hook knows about the invocation it runs for.
 *
 * Hooks run before the root command is parsed, so today this is only the process argv. Anything
 * a hook later learns about the selected command belongs here, not in a hook's own argv parsing.
 */
export interface HookInvocation {
  /** The full, unchanged process argv (executable and script included). */
  readonly argv: ReadonlyArray<string>;
}

/**
 * A hook `cli-main.ts` runs once per invocation, before the command. Its output goes to stderr;
 * it fails the invocation only with the errors `E` names.
 */
export interface InvocationHookShape<E = never> {
  readonly run: (invocation: HookInvocation) => Effect.Effect<void, E>;
}
