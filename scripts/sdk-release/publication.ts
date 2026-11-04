import { Effect, Option, Result, Schema, Stream } from 'effect';
import {
  ActionArtifact,
  CandidateManifest,
  candidateArtifactName,
  isRetained,
  originalCandidates,
  readVerifiedCandidate,
} from './artifacts';
import { committedBatch, publicationState } from './coordination';
import {
  REPOSITORY_PATH,
  SDK_RELEASE_REPOSITORY,
  Sha,
  commentIssue,
  getRun,
  paginateArray,
  request,
} from './github';
import type { Language } from './lanes';
import { reconcileRegistry, statusDistribution, type Distribution } from './registry';
import { ensure, fail } from './runtime';
import type { ReleaseBatch } from './source';

const DocsState = Schema.Literals(['pending', 'failed', 'verified']);
type DocsState = typeof DocsState.Type;
const InventoryState = Schema.Literals(['matching', 'missing', 'unverified']);

const ReportCandidate = Schema.Struct({
  artifact: ActionArtifact,
  manifest: Schema.optional(CandidateManifest),
});
const InventoryEntry = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  file: Schema.String,
  state: InventoryState,
});

export const PublicationReport = Schema.Struct({
  runId: Schema.Int.check(Schema.isGreaterThan(0)),
  sourceSha: Sha,
  registryVerified: Schema.Boolean,
  terminal: Schema.Boolean,
  docs: DocsState.pipe(Schema.withDecodingDefaultKey(Effect.succeed('pending' as const))),
  maintenance: Schema.optional(
    Schema.Literals(['pending', 'success', 'failure', 'cancelled', 'skipped'])
  ),
  detail: Schema.optional(Schema.String),
  candidates: Schema.Array(ReportCandidate),
  inventory: Schema.Array(InventoryEntry).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
});
export type PublicationReport = typeof PublicationReport.Type;
type ReportCandidate = typeof ReportCandidate.Type;
type InventoryEntry = typeof InventoryEntry.Type;

const Comment = Schema.Struct({
  id: Schema.Number,
  body: Schema.String,
  performed_via_github_app: Schema.optional(Schema.NullOr(Schema.Struct({ id: Schema.Number }))),
});
type Comment = typeof Comment.Type;

const marker = (batch: ReleaseBatch) => `<!-- sdk-release-publication:${batch.id} -->`;
const REPORT_DATA = /<script type="application\/json" data-sdk-publication>([\s\S]*?)<\/script>/;
const STATUS_ISSUE = /^\/ComposioHQ\/composio\/issues\/([1-9][0-9]*)$/;

/** The App-owned status comment for this batch on an issue or PR. */
const statusComment = (number: number, batch: ReleaseBatch, appId: number) =>
  paginateArray(`${REPOSITORY_PATH}/issues/${number}/comments`, Comment).pipe(
    Stream.filter(
      comment =>
        comment.performed_via_github_app?.id === appId && comment.body.startsWith(marker(batch))
    ),
    Stream.runHead
  );

const issueNumber = (batch: ReleaseBatch) =>
  Effect.gen(function* () {
    const url = new URL(batch.statusUrl);
    const match = url.pathname.match(STATUS_ISSUE);
    if (url.origin !== 'https://github.com' || !match)
      return yield* fail('Release status must identify the canonical repository issue');
    return Number(match[1]);
  });

const parsePublicationComment = (saved: Option.Option<Comment>) =>
  Effect.transposeOption(
    Option.flatMap(saved, comment =>
      Option.fromNullishOr(comment.body.match(REPORT_DATA)?.[1])
    ).pipe(
      Option.map(data => Schema.decodeUnknownEffect(Schema.fromJsonString(PublicationReport))(data))
    )
  );

export const readPublicationStatus = (batch: ReleaseBatch, appId: number) =>
  Effect.gen(function* () {
    return yield* parsePublicationComment(
      yield* statusComment(yield* issueNumber(batch), batch, appId)
    );
  });

const PUBLISHED_STATUS: Record<DocsState, string> = {
  verified: 'Packages published; release documentation verified.',
  pending: 'Packages published; docs pending.',
  failed: 'Packages published; docs pending.',
};
const DOCS_DETAIL: Record<DocsState, string> = {
  verified: 'Live HTML, Markdown, version table and representative SDK references verified.',
  failed:
    'Current protected docs rebuild/deployment or live verification failed; retry this original run for docs only.',
  pending: 'Current protected docs rebuild/deployment and live verification pending.',
};

const statusLine = (report: PublicationReport) => {
  if (report.registryVerified) return PUBLISHED_STATUS[report.docs];
  return report.terminal
    ? 'Publication incomplete; recovery ended. Request a newly approved higher-version corrective release.'
    : 'Publication incomplete; retry the original run to reuse the selected versions and original bytes.';
};

const docsDetail = (report: PublicationReport) =>
  report.registryVerified
    ? `${DOCS_DETAIL[report.docs]} Guide/pin maintenance: ${report.maintenance ?? 'pending'}. Search indexing remains the separate Docs - Sync Algolia Search workflow; its failures require maintenance recovery.`
    : '';

const candidateRow = ({ artifact, manifest }: ReportCandidate) => {
  const files =
    manifest?.files
      .map(file => `  - ${file.name}: sha256:${file.sha256} (${file.size} bytes)`)
      .join('\n') ?? '  - Original file inventory unavailable.';
  return `- Artifact ${artifact.id}: ${artifact.digest}; producer ${artifact.workflow_run.id}; source ${artifact.workflow_run.head_sha}; expires ${artifact.expires_at}${artifact.expired ? ' (expired)' : ''}\n${files}`;
};

const renderStatus = (batch: ReleaseBatch, report: PublicationReport) => {
  const rows = report.candidates.map(candidateRow).join('\n');
  const inventory = report.inventory
    .map(file => `- ${file.name}@${file.version}/${file.file}: ${file.state}`)
    .join('\n');
  return `${marker(batch)}\n${statusLine(report)}\n\n${docsDetail(report)}\n\n${report.detail ?? ''}\n\nOriginal publication: https://github.com/${SDK_RELEASE_REPOSITORY}/actions/runs/${report.runId}\nApproved source: ${report.sourceSha}\n\n${rows}\n\nPublic inventory:\n${inventory || 'Not yet reconciled.'}\n\n<details><summary>Publication data</summary>\n<script type="application/json" data-sdk-publication>${JSON.stringify(report).replaceAll('<', '\\u003c')}</script>\n</details>`;
};

/**
 * Docs and maintenance finish independently: a pending update never overwrites a recorded
 * result, and verified docs stay verified.
 */
const mergeWithPrevious = (
  report: PublicationReport,
  previous: PublicationReport | undefined
): PublicationReport => {
  const docs =
    previous?.docs === 'verified' || report.docs === 'pending'
      ? (previous?.docs ?? report.docs)
      : report.docs;
  const maintenance =
    report.maintenance === undefined || report.maintenance === 'pending'
      ? (previous?.maintenance ?? report.maintenance)
      : report.maintenance;
  return { ...report, docs, maintenance };
};

export const writePublicationStatus = (
  batch: ReleaseBatch,
  value: PublicationReport,
  appId: number,
  pullNumber?: number
) =>
  Effect.gen(function* () {
    const number = yield* issueNumber(batch);
    const canonical = yield* statusComment(number, batch, appId);
    const previous = Option.getOrUndefined(yield* parsePublicationComment(canonical));
    const report = mergeWithPrevious(
      yield* Schema.decodeUnknownEffect(PublicationReport)(value),
      previous
    );
    const body = renderStatus(batch, report);
    for (const target of new Set([number, ...(pullNumber ? [pullNumber] : [])])) {
      const saved = target === number ? canonical : yield* statusComment(target, batch, appId);
      yield* Option.match(saved, {
        onSome: comment =>
          request(
            'PATCH',
            `${REPOSITORY_PATH}/issues/comments/${comment.id}`,
            Schema.Struct({ id: Schema.Number }),
            { body }
          ),
        onNone: () => commentIssue(target, body),
      });
    }
    return report;
  });

interface CandidateStatus {
  readonly candidate: Option.Option<ReportCandidate>;
  readonly distributions: ReadonlyArray<Distribution>;
  readonly unavailable: boolean;
}

/** The status of one language's original candidate, verified when it is still retained. */
const candidateStatus = (
  language: Language,
  batch: ReleaseBatch,
  run: { id: number; head_sha: string },
  artifacts: ReadonlyArray<typeof ActionArtifact.Type>,
  prior: PublicationReport | undefined
) =>
  Effect.gen(function* () {
    const name = candidateArtifactName(language);
    const matching = artifacts.filter(artifact => artifact.name === name);
    yield* ensure(
      matching.length <= 1,
      'Multiple original immutable candidates identify the same language'
    );
    const [artifact] = matching;
    const previous = prior?.candidates.find(candidate => candidate.artifact.name === name);
    if (!artifact)
      return {
        candidate: Option.fromNullishOr(previous),
        distributions: [],
        unavailable: true,
      } satisfies CandidateStatus;
    yield* ensure(
      artifact.workflow_run.id === run.id && artifact.workflow_run.head_sha === run.head_sha,
      'Status candidate source/producer differs'
    );
    if (!isRetained(artifact, Date.now()))
      return {
        candidate: Option.some({
          artifact,
          ...(previous?.manifest ? { manifest: previous.manifest } : {}),
        }),
        distributions: [],
        unavailable: true,
      } satisfies CandidateStatus;
    const { manifest, files } = yield* Effect.scoped(
      readVerifiedCandidate(
        artifact,
        { sourceSha: run.head_sha, producerRun: run.id, language },
        'Status manifest source/producer differs'
      )
    );
    const distributions = yield* Effect.forEach(manifest.files, file =>
      Option.match(statusDistribution(language, file, files, batch.plan.releases), {
        onNone: () => fail('Status candidate file does not match the selected target'),
        onSome: distribution => Effect.succeed(distribution),
      })
    );
    return {
      candidate: Option.some({ artifact, manifest }),
      distributions,
      unavailable: false,
    } satisfies CandidateStatus;
  });

const inventoryEntries = (
  files: ReadonlyArray<Distribution>,
  state: InventoryEntry['state']
): ReadonlyArray<InventoryEntry> =>
  files.map(file => ({ name: file.name, version: file.version, file: file.file, state }));

/** Reconciles one package's files; a failed lookup marks them unverified and records why. */
const packageInventory = (
  files: ReadonlyArray<Distribution>,
  source: { sha: string; tag: string; runId: number }
) =>
  Effect.map(Effect.result(reconcileRegistry(files, source)), result =>
    Result.match(result, {
      onSuccess: reconciled => ({
        entries: [
          ...inventoryEntries(reconciled.existing, 'matching'),
          ...inventoryEntries(reconciled.missing, 'missing'),
        ],
        detail: Option.none<string>(),
      }),
      onFailure: error => ({
        entries: inventoryEntries(files, 'unverified'),
        detail: Option.some(
          error instanceof Error ? error.message : 'Registry reconciliation incomplete'
        ),
      }),
    })
  );

const unavailableDetail = (terminal: boolean) =>
  terminal
    ? 'Original candidate artifact unavailable. Published files remain untouched; the next approved plan must select higher corrective versions.'
    : 'Original candidate artifact unavailable before publication; retry the original preparation to rebuild only if no upload may have started.';

export const reportPublication = (runId: string, appId: number) =>
  Effect.gen(function* () {
    const run = yield* getRun(runId);
    const state = yield* publicationState(run);
    const headSha = run.head_sha ?? '';
    const committed = yield* committedBatch(headSha);
    if (Option.isNone(committed)) return yield* fail('Publication run and frozen batch differ');
    const batch = committed.value;
    const prior = Option.getOrUndefined(yield* readPublicationStatus(batch, appId));
    const artifacts = yield* originalCandidates(run.id);
    const statuses = yield* Effect.forEach(
      new Set(batch.plan.releases.map(release => release.language)),
      language =>
        candidateStatus(language, batch, { id: run.id, head_sha: headSha }, artifacts, prior)
    );
    const pulls = yield* request(
      'GET',
      `${REPOSITORY_PATH}/commits/${headSha}/pulls?per_page=100`,
      Schema.Array(
        Schema.Struct({
          number: Schema.Number,
          merged_at: Schema.NullOr(Schema.String),
          head: Schema.Struct({ sha: Schema.String }),
        })
      )
    );
    const pull = pulls.find(candidate => candidate.head.sha === headSha && candidate.merged_at);
    if (!pull) return yield* fail('Status source is not a merged release head');
    const groups = Map.groupBy(
      statuses.flatMap(status => status.distributions),
      file => `${file.language}:${file.name}`
    );
    const reconciled = yield* Effect.forEach(groups.values(), files =>
      packageInventory(files, { sha: headSha, tag: run.head_branch ?? '', runId: run.id })
    );
    const inventory = reconciled.flatMap(entry => entry.entries);
    const unavailable = statuses.some(status => status.unavailable) && !state.verified;
    const detail = [
      ...(state.terminalReason ? [state.terminalReason] : []),
      ...reconciled.flatMap(entry => Option.toArray(entry.detail)),
      ...(unavailable ? [unavailableDetail(state.terminal)] : []),
    ].join('\n');
    const report = yield* writePublicationStatus(
      batch,
      {
        runId: run.id,
        sourceSha: headSha,
        registryVerified: state.verified,
        terminal: !state.verified && state.terminal,
        docs: prior?.docs ?? 'pending',
        candidates: statuses.flatMap(status => Option.toArray(status.candidate)),
        inventory: inventory.length ? inventory : (prior?.inventory ?? []),
        ...(detail ? { detail } : {}),
      },
      appId,
      pull.number
    );
    return { batch, report, pullNumber: pull.number };
  });
