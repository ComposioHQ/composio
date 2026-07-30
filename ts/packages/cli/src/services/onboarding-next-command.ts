import { Option } from 'effect';
import { commandHintExample } from 'src/services/command-hints';
import { findTaskByToolkit, onboardToolkitSlugs } from 'src/services/onboarding-tasks';
import type { OnboardingState } from 'src/services/onboarding-state';

/**
 * The single place that decides what command to hand an agent next.
 *
 * It can answer *blocked* instead of returning a command that reproduces the state it was asked
 * about. Returning `composio onboard --json` while the connect gate is blocked would put an agent in
 * a loop, re-reading the same pending link forever.
 *
 * It takes the toolkit the caller asked for, never one the resolver adopted, so it cannot invent a
 * target. And no command it returns ever contains a placeholder: a string like
 * `composio onboard --toolkit <slug>` is a template, not a command, and an agent that execs it
 * verbatim runs against the literal text `<slug>`. Missing input is returned as data
 * (`availableToolkits`) so the caller picks a real value.
 */

export type BlockedReason =
  | 'browser_login_required'
  | 'browser_authorization_required'
  | 'toolkit_required'
  | 'connection_check_failed'
  /**
   * The read demo ran on this invocation and did not succeed. Without it the document would be
   * byte-identical to "the demo has not been attempted", and a caller polling until `onboarded`
   * would re-fire a real API read forever.
   */
  | 'demo_execution_failed';

export type NextStep =
  | { readonly kind: 'command'; readonly command: string }
  | {
      readonly kind: 'blocked';
      readonly reason: BlockedReason;
      readonly humanAction: string;
      /**
       * Set only when a command genuinely advances past the block rather than reproducing it.
       * The login block is the one case: the human opens a URL, and `composio login --poll` then
       * changes the login fact. Every connect-side block leaves this absent.
       */
      readonly command?: string;
      readonly availableToolkits?: ReadonlyArray<string>;
    }
  /**
   * Nothing left to do, but onboarding did not finish — a connected toolkit with no curated demo,
   * or a gate `--skip` left out of this invocation.
   */
  | { readonly kind: 'deferred'; readonly humanAction: string }
  /** Onboarding finished. `done` and `onboarded` mean the same thing and never disagree. */
  | { readonly kind: 'done' };

/**
 * Values this invocation produced that outlive no fact and therefore do not belong in
 * `OnboardingState`. The login URL is minted by the login delegate and is meaningless on the next
 * invocation, so it is passed in rather than resolved.
 */
export type NextCommandContext = {
  readonly loginUrl?: string;
  /**
   * The demo tool this invocation ran and failed. Like the login URL it belongs to the invocation
   * rather than to any fact — the next invocation has no way to observe that an earlier read failed.
   */
  readonly failedDemoToolSlug?: string;
};

const TOOLKIT_REQUIRED_ACTION = 'Choose a starter task and pass its toolkit as `--toolkit`.';

const authorizationAction = (state: OnboardingState): string => {
  const toolkit = state.gates.connect.toolkit ?? 'the toolkit';
  const redirectUrl = state.gates.connect.redirectUrl;

  // Without a redirect URL there is nothing for a human to open, so the recovery is to mint a
  // fresh one. The list endpoint does not hand back the URL of a link created by an earlier
  // invocation — see `PendingLink` in `onboarding-state.ts`.
  return redirectUrl === null
    ? `Authorization for ${toolkit} is still pending. Run \`${commandHintExample('root.link', { toolkit })}\` to get a fresh authorization URL, then re-run \`composio onboard\`.`
    : `Open ${redirectUrl} and authorize ${toolkit}, then re-run \`composio onboard\`.`;
};

/**
 * The login block, which is the one block allowed to carry a command.
 *
 * The command has to be the one that changes the login fact *from here*. `composio login --poll`
 * only does that when a session already exists, and one exists only when this invocation minted it
 * — `--status` advances nothing, and a failed login delegate leaves nothing behind either. Emitting
 * `--poll` there hands back a command that fails with "No pending login found" and changes no fact,
 * which is how a polling caller ends up in an infinite loop. Without a URL the entry point is
 * `composio login --no-wait`, which mints the session and writes it to disk.
 */
const loginStep = (context: NextCommandContext): NextStep =>
  context.loginUrl === undefined
    ? {
        kind: 'blocked',
        reason: 'browser_login_required',
        humanAction:
          'Run `composio login --no-wait` to get a login URL, open it, then run `composio login --poll`.',
        command: 'composio login --no-wait',
      }
    : {
        kind: 'blocked',
        reason: 'browser_login_required',
        humanAction: `Open ${context.loginUrl}, then run \`composio login --poll\`.`,
        command: 'composio login --poll',
      };

export const nextAgentCommand = (
  state: OnboardingState,
  requestedToolkit: Option.Option<string>,
  context: NextCommandContext = {}
): NextStep => {
  if (state.onboarded) {
    return { kind: 'done' };
  }

  switch (state.nextGate) {
    case 'login':
      return loginStep(context);

    case 'connect': {
      if (state.gates.connect.status === 'unknown') {
        return {
          kind: 'blocked',
          reason: 'connection_check_failed',
          humanAction:
            'Could not verify connections. Check network access to the Composio API, then re-run `composio onboard`.',
        };
      }

      if (state.gates.connect.status === 'blocked') {
        return {
          kind: 'blocked',
          reason: 'browser_authorization_required',
          humanAction: authorizationAction(state),
        };
      }

      if (Option.isNone(requestedToolkit)) {
        return {
          kind: 'blocked',
          reason: 'toolkit_required',
          humanAction: TOOLKIT_REQUIRED_ACTION,
          availableToolkits: onboardToolkitSlugs(),
        };
      }

      return {
        kind: 'command',
        command: `${commandHintExample('root.link', { toolkit: requestedToolkit.value })} --no-wait --no-browser`,
      };
    }

    case 'execute': {
      const toolSlug = state.gates.execute.toolSlug;

      if (context.failedDemoToolSlug !== undefined) {
        // Handing back a command here would hand back the call that just failed. The recovery is a
        // human checking why, so this is a block with prose and no command.
        return {
          kind: 'blocked',
          reason: 'demo_execution_failed',
          humanAction: `${context.failedDemoToolSlug} did not run. Check that the ${state.gates.connect.toolkit ?? 'toolkit'} connection still works with \`composio connections list\`, then re-run \`composio onboard\`.`,
        };
      }

      if (toolSlug === null) {
        // Reachable when the connect gate was skipped without a toolkit ever being named.
        return {
          kind: 'blocked',
          reason: 'toolkit_required',
          humanAction: TOOLKIT_REQUIRED_ACTION,
          availableToolkits: onboardToolkitSlugs(),
        };
      }

      // The curated arguments travel with the command, so what the agent runs is the same call the
      // wizard would have made rather than a bare `-d '{}'` that happens to work for some slugs.
      const args = Option.match(
        Option.flatMap(Option.fromNullable(state.toolkit), findTaskByToolkit),
        {
          onNone: () => '{}',
          onSome: task => JSON.stringify(task.read.args),
        }
      );

      return {
        kind: 'command',
        command: commandHintExample('root.execute', { slug: toolSlug, data: `-d '${args}'` }),
      };
    }

    case null:
      // No gate is outstanding, and onboarding is unfinished — the `onboarded` check above already
      // returned otherwise. Both remaining states have to say something: `done` with
      // `onboarded: false` is a document with nothing to act on, and a caller polling until
      // `onboarded` would spin on it forever.

      // A connected toolkit with no curated demo. `composio search` changes no fact in
      // `OnboardingFacts`, so returning it as a command would loop by construction — it stays prose.
      if (state.gates.execute.status === 'deferred') {
        return {
          kind: 'deferred',
          humanAction: `No starter demo for ${state.gates.connect.toolkit ?? 'that toolkit'}. Use \`composio search\` to find a tool to run, then \`composio execute\` it.`,
        };
      }

      // A gate `--skip` left out of this invocation. Skips are never persisted, so re-running
      // without the flag is the whole recovery — but the same argv in a shell alias reproduces the
      // state, which is why the reason is stated rather than left to the caller to infer.
      return {
        kind: 'deferred',
        humanAction:
          'Onboarding is unfinished because `--skip` left a step out of this invocation. Re-run `composio onboard` without `--skip` to finish it.',
      };
  }
};
