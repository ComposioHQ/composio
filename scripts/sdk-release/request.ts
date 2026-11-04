import { Config, Effect, Match, Option, Path, Schema, Stream } from 'effect';
import {
  GitHub,
  REPOSITORY_PATH,
  RunId,
  SDK_RELEASE_REPOSITORY,
  Sha,
  commentIssue,
  decodeBase64Content,
  getRun,
  paginate,
  request,
  requestOptional,
  requireActiveMember,
  rerunFailedJobs,
  type ReleaseRun,
} from './github';
import { autoByDefault, type SdkReleasePlan } from './plan';
import { createPilotPlan } from './preview';
import { ensure, formatJson, readJson, runMain, writeFile } from './runtime';

export const ReleaseRequest = Schema.Struct({
  action: Schema.Literals(['preview', 'status', 'retry']).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('preview' as const))
  ),
  typescript: autoByDefault,
  python: autoByDefault,
  run_id: Schema.optionalKey(RunId),
}).check(
  Schema.makeFilter(value =>
    value.action !== 'retry' || value.run_id !== undefined
      ? undefined
      : { path: ['run_id'], issue: 'Retry requires the original run ID' }
  )
);
export type ReleaseRequest = typeof ReleaseRequest.Type;
const decodeRequest = Schema.decodeUnknownSync(ReleaseRequest);

const Dispatch = Schema.Struct({
  inputs: Schema.Record(Schema.String, Schema.Unknown).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({}))
  ),
});
const Issue = Schema.Struct({ issue: Schema.Struct({ body: Schema.String }) });

/** Issue-form headings and the request fields they fill. */
const ISSUE_FIELDS = {
  Action: 'action',
  TypeScript: 'typescript',
  Python: 'python',
  'Original run ID': 'run_id',
} as const;
const REQUIRED_ISSUE_FIELDS = ['Action', 'TypeScript', 'Python'] as const;
const ISSUE_FIELD_PATTERN =
  /^### (Action|TypeScript|Python|Original run ID)\r?\n\r?\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm;
const parseIssueBody = (body: string) => {
  const fields = new Map<keyof typeof ISSUE_FIELDS, string>();
  for (const match of body.matchAll(ISSUE_FIELD_PATTERN)) {
    const heading = match[1] as keyof typeof ISSUE_FIELDS;
    if (fields.has(heading)) throw new Error(`Duplicate release field: ${heading}`);
    fields.set(heading, match[2].trim());
  }
  if (!REQUIRED_ISSUE_FIELDS.every(heading => fields.has(heading)))
    throw new Error('Use the SDK release request issue form');
  return Object.fromEntries([...fields].map(([heading, value]) => [ISSUE_FIELDS[heading], value]));
};

interface RequestSource {
  readonly fields: (payload: unknown) => Record<string, unknown>;
  /** Values a source uses for an omitted original run ID. */
  readonly emptyRunIds: ReadonlySet<unknown>;
}

const REQUEST_SOURCES: Record<string, RequestSource> = {
  workflow_dispatch: {
    fields: payload => Schema.decodeUnknownSync(Dispatch)(payload).inputs,
    emptyRunIds: new Set([undefined, '']),
  },
  issues: {
    fields: payload => parseIssueBody(Schema.decodeUnknownSync(Issue)(payload).issue.body),
    emptyRunIds: new Set([undefined, '', '_No response_']),
  },
};

/** Normalizes an issue-form or dispatch request through one schema. */
export function parseReleaseRequest(eventName: string, payload: unknown): ReleaseRequest {
  const source = REQUEST_SOURCES[eventName];
  if (!source) throw new Error('Unsupported SDK release request event');
  const { run_id, ...fields } = source.fields(payload);
  return decodeRequest(source.emptyRunIds.has(run_id) ? fields : { ...fields, run_id });
}

export interface PilotContext {
  readonly actor: string;
  readonly runId: string;
  readonly sourceSha: string;
  readonly issueNumber?: number;
}
export interface PilotResult {
  readonly state:
    'preview' | 'existing' | 'nothing-to-release' | 'idle' | 'retrying' | 'run-status';
  readonly message: string;
  readonly pullRequest?: string;
  readonly runUrl?: string;
  readonly plan?: SdkReleasePlan;
}

const WORKFLOW_PATH = '.github/workflows/sdk.release.yml';
const PREVIEW_MARKER = '<!-- sdk-release-preview -->';
const RETRYABLE_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out']);
const MAX_RUN_ATTEMPTS = 50;
const RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const runUrl = (id: string) => `https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${id}`;
const previewPath = (runId: string) => `.github/sdk-release-previews/${runId}.json`;

const PullRequest = Schema.Struct({
  number: Schema.Int.check(Schema.isGreaterThan(0)),
  html_url: Schema.String,
  draft: Schema.Boolean,
  body: Schema.NullOr(Schema.String),
  head: Schema.Struct({
    ref: Schema.String,
    repo: Schema.NullOr(Schema.Struct({ full_name: Schema.String })),
  }),
});
const Commit = Schema.Struct({ sha: Sha, tree: Schema.Struct({ sha: Sha }) });
const ShaRef = Schema.Struct({ object: Schema.Struct({ sha: Sha }) });
const CreatedSha = Schema.Struct({ sha: Sha });

const isPilotPullRequest = (pull: typeof PullRequest.Type) =>
  pull.draft &&
  pull.head.repo?.full_name === SDK_RELEASE_REPOSITORY &&
  /^sdk-release\/preview-\d+$/.test(pull.head.ref) &&
  pull.body?.includes(PREVIEW_MARKER) === true;

export const findPilotPullRequest = paginate(
  `${REPOSITORY_PATH}/pulls?state=open&base=next`,
  PullRequest
).pipe(Stream.filter(isPilotPullRequest), Stream.runHead);

/** A recovered preview branch must hold exactly the original plan file on top of its source. */
const verifyPreviewBranch = (id: string, source: string, head: string, contents: string) =>
  Effect.gen(function* () {
    const saved = yield* request(
      'GET',
      `${REPOSITORY_PATH}/git/commits/${head}`,
      Schema.Struct({ parents: Schema.Array(Schema.Struct({ sha: Sha })) })
    );
    const file = yield* request(
      'GET',
      `${REPOSITORY_PATH}/contents/${previewPath(id)}?ref=${head}`,
      Schema.Struct({ encoding: Schema.Literal('base64'), content: Schema.String })
    );
    const diff = yield* request(
      'GET',
      `${REPOSITORY_PATH}/compare/${source}...${head}`,
      Schema.Struct({
        files: Schema.Array(Schema.Struct({ filename: Schema.String, status: Schema.String })),
      })
    );
    const [changed] = diff.files;
    const [parent] = saved.parents;
    yield* ensure(
      diff.files.length === 1 &&
        changed.filename === previewPath(id) &&
        changed.status === 'added' &&
        saved.parents.length === 1 &&
        parent.sha === source &&
        (yield* decodeBase64Content(file.content)) === contents,
      'The original preview branch no longer matches its source and plan'
    );
  });

const createPreviewBranch = (
  id: string,
  branch: string,
  commit: typeof Commit.Type,
  contents: string
) =>
  Effect.gen(function* () {
    const tree = yield* request('POST', `${REPOSITORY_PATH}/git/trees`, CreatedSha, {
      base_tree: commit.tree.sha,
      tree: [{ path: previewPath(id), mode: '100644', type: 'blob', content: contents }],
    });
    const prepared = yield* request('POST', `${REPOSITORY_PATH}/git/commits`, CreatedSha, {
      message: 'chore(release): preview SDK release request',
      parents: [commit.sha],
      tree: tree.sha,
    });
    yield* request('POST', `${REPOSITORY_PATH}/git/refs`, Schema.Struct({ ref: Schema.String }), {
      ref: `refs/heads/${branch}`,
      sha: prepared.sha,
    });
  });

export const createPilotPullRequest = (runId: string, sourceSha: string, contents: string) =>
  Effect.gen(function* () {
    const id = yield* Schema.decodeUnknownEffect(RunId)(runId);
    const source = yield* Schema.decodeUnknownEffect(Sha)(sourceSha);
    const commit = yield* request('GET', `${REPOSITORY_PATH}/git/commits/${source}`, Commit);
    yield* ensure(commit.sha === source, 'Preview source commit did not match');
    const branch = `sdk-release/preview-${id}`;
    const existing = yield* requestOptional(`${REPOSITORY_PATH}/git/ref/heads/${branch}`, ShaRef);
    yield* Option.match(existing, {
      onSome: ref => verifyPreviewBranch(id, source, ref.object.sha, contents),
      onNone: () => createPreviewBranch(id, branch, commit, contents),
    });
    const pull = yield* request('POST', `${REPOSITORY_PATH}/pulls`, PullRequest, {
      title: 'chore(release): preview SDK release request',
      base: 'next',
      head: branch,
      draft: true,
      body: `${PREVIEW_MARKER}\nThis draft is a plan-only pilot. It does not change SDK versions, consume notes, update production docs, merge, create a source tag, or publish packages.\n\nOriginal run: ${runUrl(id)}\n\nInspect the plan artifact and close this draft after the access test. Do not merge it.`,
    });
    return pull.html_url;
  });

const isRecoverable = (run: ReleaseRun, now: number) =>
  RETRYABLE_CONCLUSIONS.has(run.conclusion ?? '') &&
  run.run_attempt < MAX_RUN_ATTEMPTS &&
  now - Date.parse(run.created_at) < RECOVERY_WINDOW_MS;

const retryOriginal = (runId: string) =>
  Effect.gen(function* () {
    const original = yield* getRun(runId);
    yield* ensure(
      original.path === WORKFLOW_PATH &&
        original.head_branch === 'next' &&
        original.repository.full_name === SDK_RELEASE_REPOSITORY,
      'Run does not belong to the guarded SDK release pilot on next'
    );
    if (original.status !== 'completed')
      return {
        state: 'run-status',
        message: `Original retry is ${original.status}. New language choices are ignored.`,
        runUrl: original.html_url,
      } satisfies PilotResult;
    yield* ensure(
      isRecoverable(original, Date.now()),
      'Retry requires a failed original SDK release pilot within 30 days and 50 attempts'
    );
    yield* rerunFailedJobs(String(original.id));
    return {
      state: 'retrying',
      message: 'Retrying the original run. New language choices are ignored.',
      runUrl: original.html_url,
    } satisfies PilotResult;
  });

const originalStatus = (runId: string) =>
  Effect.gen(function* () {
    const original = yield* getRun(runId);
    yield* ensure(
      original.path === WORKFLOW_PATH && original.repository.full_name === SDK_RELEASE_REPOSITORY,
      'Run does not belong to the SDK release workflow'
    );
    const conclusion = original.conclusion ? ` (${original.conclusion})` : '';
    return {
      state: 'run-status',
      message: `Original run: ${original.status}${conclusion}.`,
      runUrl: original.html_url,
    } satisfies PilotResult;
  });

const previewOrStatus = <E, R>(
  normalized: ReleaseRequest,
  context: PilotContext,
  plan: Effect.Effect<SdkReleasePlan, E, R>
) =>
  Effect.gen(function* () {
    const current = yield* findPilotPullRequest;
    if (Option.isSome(current))
      return {
        state: 'existing',
        message: 'A preview is already active; no new versions were allocated.',
        pullRequest: current.value.html_url,
      } satisfies PilotResult;
    if (normalized.action === 'status')
      return { state: 'idle', message: 'No active SDK release preview.' } satisfies PilotResult;
    const selected = yield* plan;
    if (!selected.releases.length)
      return {
        state: 'nothing-to-release',
        message: 'Nothing to release. Registry baselines were reconciled.',
        plan: selected,
      } satisfies PilotResult;
    const pullRequest = yield* createPilotPullRequest(
      context.runId,
      context.sourceSha,
      formatJson({
        mode: 'preview',
        inputBase: context.sourceSha,
        originalRunId: context.runId,
        plan: selected,
      })
    );
    return {
      state: 'preview',
      message: 'Plan-only draft prepared. Publication is unavailable in this pilot.',
      pullRequest,
      plan: selected,
    } satisfies PilotResult;
  });

const executeAuthorizedPilotRequest = <E, R>(
  normalized: ReleaseRequest,
  context: PilotContext,
  plan: Effect.Effect<SdkReleasePlan, E, R>
): Effect.Effect<PilotResult, unknown, GitHub | R> =>
  Match.value(normalized).pipe(
    Match.when({ action: 'retry', run_id: Match.string }, request => retryOriginal(request.run_id)),
    Match.when({ action: 'status', run_id: Match.string }, request =>
      originalStatus(request.run_id)
    ),
    Match.orElse(request => previewOrStatus(request, context, plan))
  );

const replyToIssue = (context: PilotContext, body: string) =>
  context.issueNumber === undefined ? Effect.void : commentIssue(context.issueNumber, body);

export const executePilotRequest = <E, R>(
  request: ReleaseRequest,
  context: PilotContext,
  plan: Effect.Effect<SdkReleasePlan, E, R>
) =>
  Effect.gen(function* () {
    const normalized = yield* Schema.decodeUnknownEffect(ReleaseRequest)(request);
    yield* requireActiveMember(context.actor);
    const result = yield* executeAuthorizedPilotRequest(normalized, context, plan).pipe(
      Effect.tapError(() =>
        replyToIssue(
          context,
          `The preview could not complete. Inspect the original run: ${runUrl(context.runId)}`
        )
      )
    );
    yield* replyToIssue(
      context,
      `${result.message}\n\n${result.pullRequest ?? result.runUrl ?? ''}`
    );
    return result;
  });

const Environment = Config.all({
  eventName: Config.schema(Schema.Literals(['issues', 'workflow_dispatch']), 'GITHUB_EVENT_NAME'),
  eventPath: Config.String('GITHUB_EVENT_PATH'),
  repository: Config.schema(Schema.Literal(SDK_RELEASE_REPOSITORY), 'GITHUB_REPOSITORY'),
  ref: Config.schema(Schema.Literal('refs/heads/next'), 'GITHUB_REF'),
  sha: Config.schema(Sha, 'GITHUB_SHA'),
  runId: Config.schema(RunId, 'GITHUB_RUN_ID'),
  token: Config.schema(Schema.NonEmptyString, 'SDK_RELEASE_TOKEN'),
  summaryPath: Config.String('GITHUB_STEP_SUMMARY'),
});
const EventEnvelope = Schema.Struct({
  sender: Schema.Struct({ login: Schema.String }),
  issue: Schema.optionalKey(Schema.Struct({ number: Schema.Int.check(Schema.isGreaterThan(0)) })),
  repository: Schema.Struct({
    full_name: Schema.Literal(SDK_RELEASE_REPOSITORY),
    default_branch: Schema.Literal('next'),
  }),
});

const summaryTable = (result: PilotResult) => {
  const rows = (result.plan?.releases ?? []).map(release => {
    const recommended =
      result.plan?.recommended.find(candidate => candidate.name === release.name)?.newVersion ??
      'none';
    return `| ${release.name} | ${recommended} | ${release.newVersion} |`;
  });
  return rows.length
    ? `| Package | Recommended | Selected |\n| --- | --- | --- |\n${rows.join('\n')}\n`
    : '';
};

const main = Effect.gen(function* () {
  const env = yield* Environment;
  const cwd = (yield* Path.Path).resolve('.');
  const event = yield* readJson(Schema.Unknown, env.eventPath);
  const envelope = yield* Schema.decodeUnknownEffect(EventEnvelope)(event);
  const request = yield* Effect.try(() => parseReleaseRequest(env.eventName, event));
  const result = yield* executePilotRequest(
    request,
    {
      actor: envelope.sender.login,
      runId: env.runId,
      sourceSha: env.sha,
      issueNumber: env.eventName === 'issues' ? envelope.issue?.number : undefined,
    },
    createPilotPlan(cwd, request)
  ).pipe(Effect.provide(GitHub.layer(env.token)));
  yield* writeFile('sdk-release-preview.json', formatJson(result));
  yield* writeFile(
    env.summaryPath,
    `${result.message}\n\n${result.pullRequest ?? result.runUrl ?? ''}\n\n${summaryTable(result)}`
  );
});

if (import.meta.main) runMain(main);
