import {
  SDK_RELEASE_STATE_TRANSITION_VERSION,
  StateTransitionSchema,
  type ReleaseState,
  type StateTransition,
} from './contracts';
import { z } from 'zod';

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

const RELEASE_START_TERMINAL_STATES = new Set<ReleaseState>([
  'preparation_failed',
  'conflict',
  'verified',
  'changelog_finalizing',
  'receipted',
  'notified',
]);
const ReceiptIndexCommentSchema = z
  .object({
    id: z.number().int().positive(),
    body: z.string(),
    user: z
      .object({
        login: z.string().min(1),
        type: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();

export interface DurableReleaseState {
  release_id: string;
  manifest_id: string;
  state: Extract<ReleaseState, 'partial' | 'conflict' | 'verified' | 'receipted' | 'notified'>;
  comment_id: number;
}

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
    !RELEASE_START_TERMINAL_STATES.has(current.state)
  ) {
    throw new Error(
      `Release ${current.release_id} is still open in state ${current.state}; cannot start ${requestedReleaseId}`
    );
  }
}

export function parseDurableReleaseStates(
  rawComments: unknown[],
  trustedLogin: string
): DurableReleaseState[] {
  const comments = rawComments
    .map(comment => ReceiptIndexCommentSchema.parse(comment))
    .filter(comment => comment.user.login === trustedLogin && comment.user.type === 'Bot');
  const states = comments.flatMap(comment => {
    const manifest = /<!-- sdk-release-index:([a-f0-9]{64}) -->/.exec(comment.body);
    if (!manifest) return [];
    const release = /^Release: `([A-Za-z0-9][A-Za-z0-9._-]*)`$/m.exec(comment.body);
    if (!release) throw new Error(`Receipt index comment ${comment.id} is missing its release`);
    const attempts = [
      ...comment.body.matchAll(
        /^- Attempt (\d+): \*\*(partial|conflict|verified|receipted|notified)\*\*/gm
      ),
    ]
      .map(match => ({
        attempt: Number(match[1]),
        state: match[2] as DurableReleaseState['state'],
      }))
      .sort((left, right) => left.attempt - right.attempt);
    const latest = attempts.at(-1);
    if (!latest) throw new Error(`Receipt index comment ${comment.id} has no attempt outcome`);
    return [
      {
        release_id: release[1]!,
        manifest_id: manifest[1]!,
        state: latest.state,
        comment_id: comment.id,
      },
    ];
  });
  const duplicate = states.find(
    (state, index) =>
      states.findIndex(candidate => candidate.release_id === state.release_id) !== index
  );
  if (duplicate) {
    throw new Error(`Release ${duplicate.release_id} has multiple trusted receipt indexes`);
  }
  return states;
}

export function assertCanStartFromDurableStates(
  states: readonly DurableReleaseState[],
  requestedReleaseId: string
): void {
  for (const state of states) {
    assertCanStartRelease(state, requestedReleaseId);
  }
}
