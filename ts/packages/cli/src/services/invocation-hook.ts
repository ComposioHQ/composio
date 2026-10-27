import type { Effect } from 'effect';
import type { CommandIdentity } from 'src/invocation/command-identity';

/**
 * What a hook knows about the invocation it runs for: the command `effect/cli` selected. A hook
 * never reads argv; anything it needs to know about the command belongs in its `CommandMeta`.
 */
export interface HookInvocation {
  readonly identity: CommandIdentity;
}

/**
 * A hook the invocation (`src/invocation/invocation.ts`) runs once for the selected command,
 * right after the command began, unless the command's `CommandMeta` turns it off. Its output goes
 * to stderr; it never fails the command.
 */
export interface InvocationHookShape {
  readonly run: (invocation: HookInvocation) => Effect.Effect<void>;
}
