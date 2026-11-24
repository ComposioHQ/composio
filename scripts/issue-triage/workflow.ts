import { Array as Arr, Config, Console, Context, Effect, FileSystem, Layer, Result, Schema } from 'effect';
import { annotate, StepOutputs } from '../lib/actions.ts';
import { PositiveInt, PositiveIntFromString } from '../lib/github.ts';
import { Issues, type Issue } from './issues.ts';
import { Jev, JevAnswers } from './jev.ts';
import { Plain, type PlainIssue } from './plain.ts';
import {
  FORWARD_FAILED,
  FORWARDED,
  LABEL_METADATA,
  REDIRECT_COMMENT,
  REDIRECT_MARKER,
  REDIRECT_PENDING,
  REDIRECTED,
  SUPPORT_LABEL,
  TRIAGE_LABEL,
  isSupportStateLabel,
  needsClassification,
  route,
  type TriageAction,
  type TriageEvent,
} from './route.ts';

/** The fields of an `issues`, `issue_comment`, or `workflow_dispatch` payload that triage reads. */
export const EventPayload = Schema.Struct({
  action: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.Struct({ name: Schema.String })),
  issue: Schema.optionalKey(
    Schema.Struct({
      number: PositiveInt,
      user: Schema.NullOr(Schema.Struct({ login: Schema.String })),
      labels: Schema.Array(Schema.Struct({ name: Schema.String })),
      pull_request: Schema.optionalKey(Schema.Unknown),
    })
  ),
  // An API dispatch without inputs sends `"inputs": null`.
  inputs: Schema.optionalKey(Schema.NullOr(Schema.Struct({ issue_number: Schema.optionalKey(Schema.String) }))),
});
export type EventPayload = typeof EventPayload.Type;

/** The workflow run that started this step. */
export class WorkflowRun extends Context.Service<
  WorkflowRun,
  {
    readonly eventName: string;
    readonly payload: EventPayload;
    readonly actor: string;
    readonly attempt: number;
    readonly repository: string;
  }
>()('issue-triage/WorkflowRun') {
  static readonly layer = Layer.effect(
    WorkflowRun,
    Effect.gen(function* () {
      const env = yield* Config.all({
        eventName: Config.String('GITHUB_EVENT_NAME'),
        eventPath: Config.String('GITHUB_EVENT_PATH'),
        actor: Config.String('GITHUB_ACTOR'),
        attempt: Config.schema(PositiveIntFromString, 'GITHUB_RUN_ATTEMPT'),
        repository: Config.String('GITHUB_REPOSITORY'),
      });
      const fs = yield* FileSystem.FileSystem;
      const payload = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(EventPayload))(
        yield* fs.readFileString(env.eventPath)
      );
      return WorkflowRun.of({ ...env, payload });
    })
  );
}

const IssueAction = Schema.Literals(['opened', 'reopened', 'edited']);

export const triageEvent = (eventName: string, payload: EventPayload): TriageEvent => {
  if (eventName === 'workflow_dispatch') return { type: 'dispatch' };
  if (eventName === 'issue_comment') return { type: 'author-comment' };
  if (payload.action === 'labeled') return { type: 'labeled', label: payload.label?.name ?? '' };
  return { type: Schema.is(IssueAction)(payload.action) ? payload.action : 'opened' };
};

/** Labels whose `labeled` event a maintainer can use to request triage. */
export const REQUEST_LABELS: readonly string[] = [TRIAGE_LABEL, SUPPORT_LABEL, FORWARDED];

/**
 * Who may start triage without a permission check: anyone opening an issue, and a reporter
 * replying on their own redirected issue. Other events need write access.
 */
export const admission = (eventName: string, payload: EventPayload, actor: string) => {
  if (eventName === 'issues' && payload.action === 'opened') return 'allow';
  if (eventName === 'issue_comment') {
    const issue = payload.issue;
    const reporterReply =
      payload.action === 'created' &&
      issue?.pull_request === undefined &&
      issue?.user?.login === actor &&
      issue.labels.some(label => label.name === REDIRECTED);
    return reporterReply ? 'allow' : 'deny';
  }
  if (payload.action === 'labeled' && !REQUEST_LABELS.includes(payload.label?.name ?? '')) return 'deny';
  return 'check-permission';
};

export const authorize = Effect.gen(function* () {
  const run = yield* WorkflowRun;
  const decision = admission(run.eventName, run.payload, run.actor);
  const allowed = decision === 'check-permission' ? yield* (yield* Issues).canWrite(run.actor) : decision === 'allow';
  yield* (yield* StepOutputs).set('allowed', String(allowed));
});

/** What `classify` hands to `apply`: fresh answers, a failure, nothing new, or a forwarding sweep. */
const bare = <K extends string>(kind: K) => Schema.Struct({ kind: Schema.Literal(kind) });
export const Classification = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('answers'), answers: JevAnswers }),
  bare('failed'),
  bare('none'),
  bare('sweep'),
]);
export type Classification = typeof Classification.Type;

export class InvalidIssueNumber extends Schema.TaggedError<InvalidIssueNumber>()('InvalidIssueNumber', {
  input: Schema.String,
}) {
  override get message() {
    return `Invalid issue_number: ${JSON.stringify(this.input)}`;
  }
}

export class NotAnIssue extends Schema.TaggedError<NotAnIssue>()('NotAnIssue', { number: Schema.Int }) {
  override get message() {
    return `Cannot triage pull request #${this.number} as an issue`;
  }
}

/**
 * Apply jobs run one per group, and every run for an issue lands in the same group, so retries of
 * one issue are serialized while a sweep stays within GitHub's matrix limit.
 */
export const APPLY_GROUPS = 64;
export const batches = (numbers: ReadonlyArray<number>) =>
  Object.values(Arr.groupBy(numbers, number => String(number % APPLY_GROUPS))).map(group => ({
    group: group[0] % APPLY_GROUPS,
    numbers: group,
  }));

const publish = (classification: Classification, numbers: ReadonlyArray<number>) =>
  Effect.gen(function* () {
    const outputs = yield* StepOutputs;
    yield* outputs.set('classification', JSON.stringify(classification));
    yield* outputs.set('batches', JSON.stringify(batches(numbers)));
  });

const classifyIssue = (issue: Issue) =>
  Effect.flatMap(Jev, jev => jev.classify({ title: issue.title, body: issue.body })).pipe(
    Effect.map((answers): Classification => ({ kind: 'answers', answers })),
    // A failure still reaches apply, which records it as the triage label.
    Effect.catch(error =>
      Effect.as(annotate('warning', `Classification failed: ${error.message}`), { kind: 'failed' } as const)
    )
  );

export const classify = Effect.gen(function* () {
  const run = yield* WorkflowRun;
  const issues = yield* Issues;
  const requested =
    run.eventName === 'workflow_dispatch'
      ? (run.payload.inputs?.issue_number ?? '').trim()
      : String(run.payload.issue?.number ?? '');
  // A blank dispatch retries forwarding for every open issue whose forward failed.
  if (requested === '') {
    const failed = yield* issues.listOpen(FORWARD_FAILED);
    return failed.length === 0 ? undefined : yield* publish({ kind: 'sweep' }, failed);
  }
  const number = yield* Schema.decodeUnknownEffect(PositiveIntFromString)(requested).pipe(
    Effect.mapError(() => new InvalidIssueNumber({ input: requested }))
  );
  const issue = yield* issues.get(number);
  if (issue.isPullRequest) return yield* new NotAnIssue({ number });
  const event = triageEvent(run.eventName, run.payload);
  if (issue.state === 'closed' && event.type !== 'author-comment') return;
  const classification = needsClassification(event, issue.labels)
    ? yield* classifyIssue(issue)
    : ({ kind: 'none' } as const);
  yield* publish(classification, [number]);
});

export class ClassificationFailed extends Schema.TaggedError<ClassificationFailed>()('ClassificationFailed', {}) {
  override get message() {
    return 'Classification failed; added the triage label for a retry.';
  }
}

const labelsOf = (actions: ReadonlyArray<TriageAction>, type: 'add-label' | 'remove-label') => [
  ...new Set(actions.flatMap(action => (action.type === type ? [action.label] : []))),
];

/** Writes to one issue in the order that keeps every failure point resumable. */
const issueWriter = (issues: Issues['Service'], number: number) => ({
  add: (labels: ReadonlyArray<string>) =>
    labels.length === 0
      ? Effect.void
      : Effect.forEach(
          labels.flatMap(name => (LABEL_METADATA[name] ? [{ name, ...LABEL_METADATA[name] }] : [])),
          issues.ensureLabel,
          { discard: true }
        ).pipe(Effect.andThen(issues.addLabels(number, [...new Set(labels)]))),
  remove: (labels: ReadonlyArray<string>) =>
    Effect.forEach(labels, label => issues.removeLabel(number, label), { discard: true }),
  perform: (action: TriageAction) => {
    switch (action.type) {
      case 'add-assignees':
        return issues.assign(number, action.assignees);
      case 'comment':
        return issues.comment(number, action.body);
      case 'close':
        return issues.setState(number, 'closed', action.reason);
      default:
        return Effect.void;
    }
  },
});

const plainIssue = (issue: Issue, repository: string): PlainIssue => {
  const [owner = '', repo = ''] = repository.split('/');
  return { owner, repo, number: issue.number, title: issue.title, body: issue.body, htmlUrl: issue.url, author: issue.author };
};

/**
 * A redirect saves its recovery labels before it comments, comments at most once, and clears the
 * pending marker last, so a rerun after any failure finishes the redirect.
 */
const finishRedirect = Effect.fnUntraced(function* (issue: Issue, actions: ReadonlyArray<TriageAction>) {
  const issues = yield* Issues;
  const write = issueWriter(issues, issue.number);
  const removes = labelsOf(actions, 'remove-label');
  yield* write.add([
    ...labelsOf(actions, 'add-label'),
    ...(issue.labels.includes(REDIRECT_PENDING) ? [] : [REDIRECT_PENDING]),
  ]);
  yield* write.remove(removes.filter(label => label !== TRIAGE_LABEL));
  if (!(yield* issues.hasWorkflowComment(issue.number, REDIRECT_MARKER)))
    yield* issues.comment(issue.number, REDIRECT_COMMENT);
  yield* Effect.forEach(actions.filter(action => action.type === 'close'), write.perform, { discard: true });
  yield* write.remove([...removes.filter(label => label === TRIAGE_LABEL), REDIRECT_PENDING]);
});

/** Labels kept until the end, so an interrupted run leaves the issue where a retry resumes it. */
const DEFERRED_REMOVALS = [TRIAGE_LABEL, REDIRECT_PENDING];

/**
 * Forwarding first marks the issue `support: forward failed`; any later failure leaves an issue the
 * sweep, a numbered dispatch, or the reporter's next reply resumes. Plain reuses the thread on retry.
 */
const applyActions = Effect.fnUntraced(function* (issue: Issue, actions: ReadonlyArray<TriageAction>) {
  const issues = yield* Issues;
  const run = yield* WorkflowRun;
  const write = issueWriter(issues, issue.number);
  const has = (type: TriageAction['type']) => actions.some(action => action.type === type);
  const forwarding = has('forward');
  if (forwarding) yield* write.add([SUPPORT_LABEL, FORWARD_FAILED].filter(label => !issue.labels.includes(label)));
  if (has('reopen')) yield* issues.setState(issue.number, 'open');
  const forwarded = forwarding
    ? yield* Effect.result(Effect.flatMap(Plain, plain => plain.forward(plainIssue(issue, run.repository))))
    : Result.succeed(undefined);
  const failure = Result.isFailure(forwarded) ? forwarded.failure : undefined;

  const adds = labelsOf(actions, 'add-label').filter(label => failure === undefined || label !== FORWARDED);
  const removes = [
    ...(failure === undefined
      ? labelsOf(actions, 'remove-label')
      : issue.labels.filter(label => isSupportStateLabel(label) && label !== FORWARD_FAILED)),
    ...(forwarding && issue.labels.includes(REDIRECT_PENDING) ? [REDIRECT_PENDING] : []),
  ];
  yield* write.add(adds);
  yield* write.remove(removes.filter(label => label !== FORWARD_FAILED && !DEFERRED_REMOVALS.includes(label)));
  yield* Effect.forEach(actions, write.perform, { discard: true });
  yield* write.remove(DEFERRED_REMOVALS.filter(label => removes.includes(label)));
  if (forwarding && failure === undefined) yield* issues.removeLabel(issue.number, FORWARD_FAILED);
  if (failure !== undefined) return yield* failure;
});

export const applyIssue = Effect.fnUntraced(function* (number: number, classification: Classification) {
  const issues = yield* Issues;
  const run = yield* WorkflowRun;
  // Re-fetched under the per-issue lock; everything below decides from this fresh state.
  const issue = yield* issues.get(number);
  if (issue.isPullRequest) return;
  if (classification.kind === 'sweep' && !(issue.state === 'open' && issue.labels.includes(FORWARD_FAILED)))
    return yield* Console.log(`Skipping #${number}: no longer an open issue awaiting a Plain retry.`);
  const actions = route(
    triageEvent(run.eventName, run.payload),
    { labels: issue.labels, state: issue.state, closedByWorkflow: issue.closedByWorkflow, rerun: run.attempt > 1 },
    classification.kind === 'sweep' ? { kind: 'none' } : classification
  );
  yield* actions.some(action => action.type === 'comment' && action.body === REDIRECT_COMMENT)
    ? finishRedirect(issue, actions)
    : applyActions(issue, actions);
  if (classification.kind === 'failed') return yield* new ClassificationFailed();
});

export class ApplyFailed extends Schema.TaggedError<ApplyFailed>()('ApplyFailed', {
  failures: Schema.Array(Schema.Struct({ issue: Schema.Int, message: Schema.String })),
}) {
  override get message() {
    return this.failures.map(failure => `#${failure.issue}: ${failure.message}`).join('; ');
  }
}

/** Applies triage to every issue in the batch; one issue's failure never stops the others. */
export const apply = Effect.fnUntraced(function* (classification: Classification, numbers: ReadonlyArray<number>) {
  const results = yield* Effect.forEach(numbers, number =>
    applyIssue(number, classification).pipe(
      Effect.result,
      Effect.map(result => ({ issue: number, result }))
    )
  );
  const failures = results.flatMap(({ issue, result }) =>
    Result.isFailure(result) ? [{ issue, message: result.failure.message }] : []
  );
  if (failures.length > 0) return yield* new ApplyFailed({ failures });
});

export const ApplyInput = Config.all({
  classification: Config.schema(Schema.fromJsonString(Classification), 'CLASSIFICATION'),
  numbers: Config.schema(Schema.fromJsonString(Schema.NonEmptyArray(PositiveInt)), 'ISSUE_NUMBERS'),
});
