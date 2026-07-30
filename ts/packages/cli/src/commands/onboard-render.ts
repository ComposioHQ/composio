import { Effect } from 'effect';
import { ciRedactReplacer } from 'src/ui/redact';
import { TerminalUI } from 'src/services/terminal-ui';
import type { NextStep } from 'src/services/onboarding-next-command';
import type { GateStatus, OnboardingState } from 'src/services/onboarding-state';

/**
 * The two renderers for `composio onboard`: the state document for stdout and the human text for
 * stderr. Both read the same resolved state and the same `NextStep`, so they cannot disagree.
 */

export const ONBOARD_STATE_KIND = 'onboard_state';

/**
 * The wire shape. Snake_case here and camelCase everywhere inside the CLI, so the serializer is the
 * single place the two conventions meet.
 *
 * `kind` is the first field of every document, including the all-gates-pass one: onboard's stdout is
 * a stream an agent multiplexes with the stdout of the commands onboard delegates to, and those
 * carry their own `kind` for the same reason.
 */
export type OnboardStateDocument = {
  readonly kind: typeof ONBOARD_STATE_KIND;
  readonly onboarded: boolean;
  readonly next_gate: string | null;
  readonly blocked: boolean;
  readonly blocked_reason: string | null;
  readonly human_action: string | null;
  readonly next_command: string | null;
  readonly task: string | null;
  readonly toolkit: string | null;
  readonly gates: {
    readonly host_wiring: {
      readonly status: GateStatus;
      readonly blocking: false;
      readonly hosts: ReadonlyArray<{
        readonly target: string;
        readonly available: boolean;
        readonly supported: boolean;
        readonly plugin_installed: boolean;
        readonly plugin_enabled: boolean;
      }>;
    };
    readonly login: {
      readonly status: GateStatus;
      readonly email: string | null;
      readonly org_id: string | null;
    };
    readonly connect: {
      readonly status: GateStatus;
      readonly toolkit: string | null;
      readonly connected_toolkits: ReadonlyArray<string>;
      readonly connected_account_id: string | null;
      readonly redirect_url: string | null;
    };
    readonly execute: {
      readonly status: GateStatus;
      readonly tool_slug: string | null;
      readonly last_executed_at: string | null;
    };
  };
  readonly advisories: ReadonlyArray<string>;
  /** Present only when `blocked_reason` is `toolkit_required`, so the caller never has to fill in a template. */
  readonly available_toolkits?: ReadonlyArray<string>;
};

const humanAction = (step: NextStep): string | null =>
  step.kind === 'blocked' || step.kind === 'deferred' ? step.humanAction : null;

/** A blocked step carries a command only when one genuinely advances past the block. */
const nextCommand = (step: NextStep): string | null => {
  switch (step.kind) {
    case 'command':
      return step.command;
    case 'blocked':
      return step.command ?? null;
    default:
      return null;
  }
};

export const onboardStateDocument = (
  state: OnboardingState,
  step: NextStep
): OnboardStateDocument => {
  const blocked = step.kind === 'blocked';

  return {
    kind: ONBOARD_STATE_KIND,
    onboarded: state.onboarded,
    next_gate: state.nextGate,
    blocked,
    blocked_reason: blocked ? step.reason : null,
    human_action: humanAction(step),
    next_command: nextCommand(step),
    task: state.task,
    toolkit: state.toolkit,
    gates: {
      host_wiring: {
        status: state.gates.hostWiring.status,
        blocking: false,
        hosts: state.gates.hostWiring.hosts.map(host => ({
          target: host.target,
          available: host.available,
          supported: host.supported,
          plugin_installed: host.pluginInstalled,
          plugin_enabled: host.pluginEnabled,
        })),
      },
      login: {
        status: state.gates.login.status,
        email: state.gates.login.email,
        org_id: state.gates.login.orgId,
      },
      connect: {
        status: state.gates.connect.status,
        toolkit: state.gates.connect.toolkit,
        connected_toolkits: state.gates.connect.connectedToolkits,
        connected_account_id: state.gates.connect.connectedAccountId,
        redirect_url: state.gates.connect.redirectUrl,
      },
      execute: {
        status: state.gates.execute.status,
        tool_slug: state.gates.execute.toolSlug,
        last_executed_at: state.gates.execute.lastExecutedAt,
      },
    },
    advisories: state.advisories,
    ...(blocked && step.availableToolkits !== undefined
      ? { available_toolkits: step.availableToolkits }
      : {}),
  };
};

/**
 * `ciRedactReplacer` for the same reason `composio execute` uses it on every payload it writes:
 * `gates.login.org_id` and `gates.connect.connected_account_id` identify a real account, and the
 * recorded `--json` output is committed to a public repository. Outside CI the document is
 * unchanged, so the contract an agent reads is untouched.
 */
export const serializeOnboardState = (state: OnboardingState, step: NextStep): string =>
  JSON.stringify(onboardStateDocument(state, step), ciRedactReplacer, 2);

const GATE_ORDER = ['login', 'connect', 'execute'] as const;

const STEP_LABELS: Readonly<Record<(typeof GATE_ORDER)[number], string>> = {
  login: 'Log in',
  connect: 'Connect a toolkit',
  execute: 'Run your first tool',
};

const stepHeading = (gate: (typeof GATE_ORDER)[number], toolkit: string | null): string => {
  const position = GATE_ORDER.indexOf(gate) + 1;
  const label = gate === 'connect' && toolkit !== null ? `Connect ${toolkit}` : STEP_LABELS[gate];
  return `Step ${position}/${GATE_ORDER.length} — ${label}`;
};

const gateSummaryLine = (label: string, status: GateStatus, detail?: string | null): string =>
  `${label}: ${status}${detail ? ` (${detail})` : ''}`;

/**
 * The human half. Decoration only — every line goes to stderr, including the nudge-style guidance,
 * because stdout belongs to the state document.
 */
export const renderOnboardHuman = (state: OnboardingState, step: NextStep) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;

    for (const advisory of state.advisories) {
      yield* ui.log.warn(advisory);
    }

    if (state.onboarded) {
      yield* ui.log.success("You're all set.");
      yield* ui.note(
        [
          gateSummaryLine('Login', state.gates.login.status, state.gates.login.email),
          gateSummaryLine(
            'Connect',
            state.gates.connect.status,
            state.gates.connect.connectedToolkits.join(', ') || null
          ),
          gateSummaryLine(
            'Execute',
            state.gates.execute.status,
            state.gates.execute.lastExecutedAt
          ),
        ].join('\n'),
        'Onboarding'
      );
      return;
    }

    if (state.nextGate !== null) {
      yield* ui.log.step(stepHeading(state.nextGate, state.gates.connect.toolkit));
    }

    switch (step.kind) {
      case 'command':
        yield* ui.log.message(`Next:\n> ${step.command}`);
        return;

      case 'blocked':
        yield* ui.log.warn(step.humanAction);
        if (step.availableToolkits !== undefined) {
          yield* ui.note(step.availableToolkits.join('\n'), 'Available starter toolkits');
        }
        return;

      case 'deferred':
        yield* ui.log.message(step.humanAction);
        return;

      case 'done':
        // Only reachable if `onboarded` and `done` ever disagreed; the early return above covers
        // every finished onboarding.
        yield* ui.log.message('Nothing left to do on this invocation.');
        return;
    }
  });
