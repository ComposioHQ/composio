import {
  SDK_RELEASE_STATE_TRANSITION_VERSION,
  StateTransitionSchema,
  type ReleaseState,
  type StateTransition,
} from './contracts';

const LEGAL_TRANSITIONS: Readonly<Record<ReleaseState, readonly ReleaseState[]>> = {
  requested: ['drafting'],
  drafting: ['preparation_pr_open', 'preparation_failed'],
  preparation_pr_open: ['drafting', 'preparation_failed', 'sealed'],
  preparation_failed: [],
  sealed: ['preflight_reconciling'],
  preflight_reconciling: ['conflict', 'waiting_for_approval'],
  conflict: [],
  waiting_for_approval: ['authorized'],
  authorized: ['publishing'],
  publishing: ['partial', 'verified'],
  partial: ['preflight_reconciling'],
  verified: ['changelog_finalizing'],
  changelog_finalizing: ['receipted'],
  receipted: ['notified'],
  notified: [],
};

export function transitionRelease(
  from: ReleaseState,
  to: ReleaseState,
  releaseId: string,
  occurredAt?: string
): StateTransition {
  if (!LEGAL_TRANSITIONS[from].includes(to)) {
    throw new Error(`Illegal SDK release transition: ${from} -> ${to}`);
  }
  return StateTransitionSchema.parse({
    schema_version: SDK_RELEASE_STATE_TRANSITION_VERSION,
    release_id: releaseId,
    from,
    to,
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
  });
}

export function assertCanStartRelease(
  current: { release_id: string; state: ReleaseState } | null,
  requestedReleaseId: string
): void {
  if (
    current &&
    current.release_id !== requestedReleaseId &&
    LEGAL_TRANSITIONS[current.state].length > 0
  ) {
    throw new Error(
      `Release ${current.release_id} is still open in state ${current.state}; cannot start ${requestedReleaseId}`
    );
  }
}
