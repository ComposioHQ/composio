import { Match, Schema } from 'effect';

/** The three workflow triggers a release passes through, in order. */
export const Stage = Schema.Literals(['request', 'review', 'publish']);
export type Stage = typeof Stage.Type;

const Url = Schema.String.check(Schema.isPattern(/^https:\/\//));
const Version = Schema.Struct({ name: Schema.String, version: Schema.String });

/**
 * Every state a release can be in, derived each run from what GitHub and the registries hold.
 * Nothing stores it; the request issue only displays the latest one.
 */
export const ReleaseState = Schema.Union([
  /** A member's request could not be read. */
  Schema.TaggedStruct('NeedsInput', { reason: Schema.String }),
  /** Another release PR is open. */
  Schema.TaggedStruct('Waiting', { pull: Url }),
  /** `next` carries a merged release plan that was never tagged. */
  Schema.TaggedStruct('Blocked', { release: Schema.String }),
  /** No pending changesets for the selected languages. */
  Schema.TaggedStruct('Empty', {}),
  /** The release PR is open for review. */
  Schema.TaggedStruct('InReview', { pull: Url }),
  /** The release PR closed without merging. */
  Schema.TaggedStruct('Abandoned', { pull: Url }),
  /** The release PR merged but failed the release gate, so nothing was tagged. */
  Schema.TaggedStruct('Refused', { pull: Url, reason: Schema.String }),
  /** The reviewed head is tagged; the tag run publishes it. */
  Schema.TaggedStruct('Tagged', { tag: Schema.String }),
  /** Every planned package is served by its registry. */
  Schema.TaggedStruct('Published', { versions: Schema.Array(Version) }),
  /** A job failed or was cancelled; re-running the failed jobs resumes the stage. */
  Schema.TaggedStruct('Failed', {
    stage: Stage,
    jobs: Schema.Array(Schema.String),
    run: Url,
  }),
]);
export type ReleaseState = typeof ReleaseState.Type;
export type StateName = ReleaseState['_tag'];

/**
 * Each stage is one workflow run. It starts from the state the previous stage ended in, and ends
 * in exactly one of `to`. A failed stage resumes from the same `from` when its jobs re-run.
 */
export const STAGES = {
  request: { from: 'Requested', to: ['NeedsInput', 'Waiting', 'Blocked', 'Empty', 'InReview'] },
  review: { from: 'InReview', to: ['Abandoned', 'Refused', 'Tagged'] },
  publish: { from: 'Tagged', to: ['Published'] },
} as const satisfies Record<
  Stage,
  { readonly from: StateName | 'Requested'; readonly to: ReadonlyArray<StateName> }
>;

/** Whether `state` is a legal end for `stage`. `Failed` ends any stage. */
export const endsStage = (stage: Stage, state: ReleaseState) =>
  state._tag === 'Failed' || (STAGES[stage].to as ReadonlyArray<StateName>).includes(state._tag);

/**
 * How each state shows on the request issue: one exclusive label, and whether the issue closes.
 * `InReview`, `Tagged` and `Failed` keep the issue open because the release can still advance.
 */
export const DISPLAY = {
  NeedsInput: { label: 'sdk-release:needs-input', close: 'not_planned' },
  Waiting: { label: 'sdk-release:waiting', close: 'not_planned' },
  Blocked: { label: 'sdk-release:blocked', close: 'not_planned' },
  Empty: { label: 'sdk-release:empty', close: 'not_planned' },
  InReview: { label: 'sdk-release:in-review', close: null },
  Abandoned: { label: 'sdk-release:abandoned', close: 'not_planned' },
  Refused: { label: 'sdk-release:refused', close: 'not_planned' },
  Tagged: { label: 'sdk-release:publishing', close: null },
  Published: { label: 'sdk-release:published', close: 'completed' },
  Failed: { label: 'sdk-release:failed', close: null },
} as const satisfies Record<
  StateName,
  { readonly label: string; readonly close: 'completed' | 'not_planned' | null }
>;

export const STATUS_LABELS: ReadonlyArray<string> = Object.values(DISPLAY).map(
  display => display.label
);

/** How to resume a failed stage. */
const RECOVERY: Record<Stage, string> = {
  request: 'Open the run and choose "Re-run failed jobs", or request the release again.',
  review: 'Open the run and choose "Re-run failed jobs"; creating the tag is safe to repeat.',
  publish:
    'Open the run and choose "Re-run failed jobs"; a re-run uploads only the files the registries are missing. If the approved candidates expired or a registry serves different bytes, add changesets and request a new release.',
};

/** The status comment text for a state. */
export const describe = (state: ReleaseState) =>
  Match.valueTags(state, {
    NeedsInput: ({ reason }) =>
      `The request could not be read: ${reason}\n\nOpen a new request with the SDK release issue form.`,
    Waiting: ({ pull }) =>
      `Another SDK release is in progress: ${pull}. Request this release again after it finishes.`,
    Blocked: ({ release }) =>
      `The release planned in run ${release} merged into \`next\` but was never tagged. Re-run its tag job, or revert its release PR on \`next\`, then request this release again.`,
    Empty: () => 'Nothing to release: no pending changesets for the selected languages.',
    InReview: ({ pull }) =>
      `Release PR: ${pull}\n\nA writer other than the requester approves it. Merging it tags and publishes the release.`,
    Abandoned: ({ pull }) =>
      `${pull} closed without merging, so nothing was tagged or published. Request a new release when ready.`,
    Refused: ({ pull, reason }) =>
      `${pull} merged, but it failed the release gate, so nothing was tagged or published.\n\nReason: ${reason}\n\nRevert the release PR on \`next\`, then request the release again.`,
    Tagged: ({ tag }) => `Tagged \`${tag}\`. The tag run publishes the reviewed files.`,
    Published: ({ versions }) =>
      ['Published:', '', ...versions.map(({ name, version }) => `- ${name} ${version}`)].join('\n'),
    Failed: ({ stage, jobs, run }) =>
      `The ${stage} stage failed in: ${jobs.join(', ')}.\n\n${run}\n\n${RECOVERY[stage]}`,
  });
