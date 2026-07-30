import { Option } from 'effect';
import { commandHintExample } from 'src/services/command-hints';
import { findTaskByToolkit, onboardToolkitSlugs } from 'src/services/onboarding-tasks';
import type { OnboardingState } from 'src/services/onboarding-state';

/**
 * Chokepoint 2: the single answer to "what command do I give the agent next".
 *
 * The invariant it exists to enforce is that it can say *blocked* instead of returning a command
 * that reproduces the state it was asked about. Returning `composio onboard --json` while the
 * connect gate is blocked would put an agent in a loop, re-reading the same pending link forever.
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
  /** Nothing left to do, but onboarding did not finish — a connected toolkit with no demo. */
  | { readonly kind: 'deferred'; readonly humanAction: string }
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

const loginAction = (context: NextCommandContext): string =>
  context.loginUrl === undefined
    ? 'Open the login URL shown above, then run `composio login --poll`.'
    : `Open ${context.loginUrl}, then run \`composio login --poll\`.`;

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
      return {
        kind: 'blocked',
        reason: 'browser_login_required',
        humanAction: loginAction(context),
        command: 'composio login --poll',
      };

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
      // The remaining unfinished terminal state is a deferred execute gate: a connected toolkit
      // with no curated demo. `composio search` changes no fact in `OnboardingFacts`, so returning
      // it as a command would break the no-loop property by construction — it stays prose.
      return state.gates.execute.status === 'deferred'
        ? {
            kind: 'deferred',
            humanAction: `No starter demo for ${state.gates.connect.toolkit ?? 'that toolkit'}. Use \`composio search\` to find a tool to run, then \`composio execute\` it.`,
          }
        : { kind: 'done' };
  }
};
