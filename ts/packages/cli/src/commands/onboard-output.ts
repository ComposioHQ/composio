import { Effect } from 'effect';
import {
  resolveOnboard,
  type OnboardGateStep,
  type OnboardResolution,
  type OnboardSkippableStep,
  type OnboardState,
} from 'src/services/onboard-state';
import { findOnboardTaskForConnectedToolkits, ONBOARD_TASKS } from 'src/services/onboard-tasks';
import type { TerminalUI } from 'src/services/terminal-ui';

const stateLabel = (state: OnboardState): string => {
  if (state.complete) return 'complete';
  if (!state.loggedIn) return 'logged_out';
  if (!state.hasConnection) return 'logged_in';
  return 'connected';
};

export const nextCommandFor = (
  state: OnboardState,
  nextStep: OnboardGateStep | undefined
): { readonly step: OnboardGateStep; readonly cmd: string } | null => {
  switch (nextStep) {
    case 'login':
      return { step: 'login', cmd: 'composio login' };
    case 'connect': {
      const toolkit = state.pendingToolkit ?? ONBOARD_TASKS[0].toolkit;
      return { step: 'connect', cmd: `composio onboard --toolkit ${toolkit}` };
    }
    case 'execute': {
      const connectedTask = findOnboardTaskForConnectedToolkits(state.connectedToolkits);
      return connectedTask
        ? { step: 'execute', cmd: `composio onboard --toolkit ${connectedTask.toolkit}` }
        : { step: 'execute', cmd: 'composio search "<what you want to do>"' };
    }
    default:
      return null;
  }
};

const resolutionFor = (
  state: OnboardState,
  invocationSkips: ReadonlyArray<OnboardSkippableStep>
): OnboardResolution => resolveOnboard({ facts: state, invocationSkips });

export const buildStateJson = (params: {
  readonly state: OnboardState;
  readonly invocationSkips: ReadonlyArray<OnboardSkippableStep>;
  readonly hint?: string;
}): string => {
  const { state } = params;
  const resolution = resolutionFor(state, params.invocationSkips);
  return JSON.stringify(
    {
      kind: 'onboard_state',
      v: 1,
      state: stateLabel(state),
      completed: resolution.completed,
      remaining: resolution.remaining,
      skipped: resolution.skipped,
      connections: {
        count: state.connectionCount,
        toolkits: state.connectedToolkits,
        ...(state.connectionCheckFailed ? { check_failed: true } : {}),
      },
      ...(state.orgId ? { org_id: state.orgId } : {}),
      next: nextCommandFor(state, resolution.nextStep),
      ...(params.hint ? { hint: params.hint } : {}),
    },
    null,
    2
  );
};

export const emitOnboardStatus = (params: {
  readonly ui: TerminalUI;
  readonly state: OnboardState;
  readonly invocationSkips: ReadonlyArray<OnboardSkippableStep>;
  readonly emitHuman: boolean;
  readonly emitJson: boolean;
  readonly forceJson: boolean;
  readonly withIntro: boolean;
}) =>
  Effect.gen(function* () {
    const { ui, state } = params;
    const resolution = resolutionFor(state, params.invocationSkips);
    if (params.withIntro) {
      yield* ui.intro('composio onboard');
    }

    if (state.loggedIn) {
      yield* ui.log.success(`Logged in${state.orgId ? ` (org ${state.orgId})` : ''}`);
    } else {
      yield* ui.log.warn('Not logged in');
    }
    if (state.connectionCheckFailed) {
      yield* ui.log.warn('Connections: unknown (could not reach the Composio API)');
    } else if (state.connectionCount > 0) {
      yield* ui.log.success(
        `${state.connectionCount} connection${state.connectionCount === 1 ? '' : 's'}: ${state.connectedToolkits.join(', ')}`
      );
    } else {
      yield* ui.log.warn('No connected apps yet');
    }
    yield* state.hasExecuted
      ? ui.log.success('First tool execution: done')
      : ui.log.warn('First tool execution: not yet');

    const next = nextCommandFor(state, resolution.nextStep);
    if (resolution.complete) {
      yield* ui.outro(
        [
          'Onboarding complete.',
          '  composio search "<what you want to do>"   find and run a tool',
          '  composio setup                            use Composio from your coding agent',
        ].join('\n')
      );
    } else if (next) {
      yield* ui.outro(`Next: ${next.cmd}`);
    } else if (resolution.connectionUnknown) {
      yield* ui.outro(
        "Couldn't reach the Composio API to check your connections. Check your network and re-run `composio onboard`."
      );
    } else {
      yield* ui.outro(
        'Nothing to do (remaining steps were skipped). Re-run without --skip to continue.'
      );
    }

    if (params.emitJson || !params.emitHuman) {
      yield* ui.output(
        buildStateJson({
          state,
          invocationSkips: params.invocationSkips,
        }),
        params.forceJson ? { force: true } : undefined
      );
    }
  });
