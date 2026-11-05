import { Schema } from 'effect';
import { PositiveInt, SDK_RELEASE_REPOSITORY, Sha, runUrl } from './github';
import type { Channel } from './channel';
import { PYTHON_RELEASE_MARKER, REGISTRY_VERSION } from './lanes';
import { issueUrl, type ReleaseBatch } from './source';

const RELEASE_BRANCH = /^sdk-release\/batch-\d+$/;

export const releaseBranch = (id: string) => `sdk-release/batch-${id}`;

export const Pull = Schema.Struct({
  number: PositiveInt,
  html_url: Schema.String,
  state: Schema.String,
  merged: Schema.optionalKey(Schema.Boolean),
  merge_commit_sha: Schema.optionalKey(Schema.NullOr(Sha)),
  /** `null` when the author's account was deleted. */
  user: Schema.NullOr(Schema.Struct({ login: Schema.String })),
  head: Schema.Struct({
    sha: Sha,
    ref: Schema.String,
    repo: Schema.NullOr(Schema.Struct({ full_name: Schema.String })),
  }),
  base: Schema.Struct({ ref: Schema.String }),
});
export type Pull = typeof Pull.Type;

export const isReleasePull = (pull: Pull) =>
  pull.head.repo?.full_name === SDK_RELEASE_REPOSITORY && RELEASE_BRANCH.test(pull.head.ref);

const NOTE_EXEMPT =
  '<!-- sdk-release-note-exempt: This release PR applies previously reviewed SDK changes and only updates release metadata and generated documentation. -->';
const SUMMARY_LIMIT = 200;

type Plan = ReleaseBatch['plan'];
type Changeset = Plan['changesets'][number];

const repositoryUrl = `https://github.com/${SDK_RELEASE_REPOSITORY}`;
const fileUrl = (branch: string, path: string) =>
  `${repositoryUrl}/${path.endsWith('/') ? 'tree' : 'blob'}/${branch}/${path}`;

/** Shows contributor text literally, so it cannot hide or add content in the reviewed body. */
const escapeMarkdown = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/[\\`*_[\]()|#!]/g, '\\$&');

/** npm-valid names render as code; anything else renders as escaped text. */
const SAFE_PACKAGE_NAME = /^@composio\/[a-z0-9][a-z0-9._-]*$/;
export const packageLabel = (name: string) =>
  name === PYTHON_RELEASE_MARKER
    ? 'Python SDK (`composio` and every provider)'
    : SAFE_PACKAGE_NAME.test(name)
      ? `\`${name}\``
      : escapeMarkdown(name);

/** First line of a changeset summary, short enough for one list item. */
const headline = (summary: string) => {
  const line = summary.trim().split('\n')[0]?.trim() || '(no summary)';
  return escapeMarkdown(
    line.length > SUMMARY_LIMIT ? `${line.slice(0, SUMMARY_LIMIT - 1)}…` : line
  );
};

const changesetLine = (note: Changeset) => {
  const bumps = note.releases
    .filter(release => release.type !== 'none')
    .map(release => `${packageLabel(release.name)} ${release.type}`)
    .join(', ');
  return `- \`.changeset/${note.id}.md\` (${bumps || 'no version bump'}): ${headline(note.summary)}`;
};

/** How a release PR explains its channel to the reviewer. */
const CHANNEL_COPY: Record<
  Channel,
  {
    readonly title: string;
    readonly summary: string;
    readonly notes: string;
    readonly afterPublish: string;
  }
> = {
  stable: {
    title: 'chore(release): publish SDK packages',
    summary: 'A stable release: npm moves `latest` to these versions.',
    notes: '## Changesets consumed',
    afterPublish:
      '5. After publishing, the bot opens a docs PR that pins the released npm versions, so twoslash checks the docs against them.',
  },
  beta: {
    title: 'chore(release): publish SDK beta packages',
    summary:
      'A beta release: npm moves `next` to these versions and never touches `latest`, and pip installs them only with `--pre` or an exact pin. This PR commits only the release plan. The candidate checks apply its versions, so `next` keeps its stable versions and every changeset below stays pending for the stable release.',
    notes: '## Changesets previewed',
    afterPublish:
      '5. A beta opens no docs PR: the docs keep following stable releases. The request issue lists the published versions.',
  },
};

export const releasePullTitle = (batch: ReleaseBatch) =>
  CHANNEL_COPY[batch.plan.choices.channel].title;

const packageRows = (plan: Plan) =>
  plan.releases.map(release => {
    const recommended = plan.recommended.find(candidate => candidate.name === release.name);
    const override =
      recommended?.newVersion === release.newVersion
        ? ''
        : ` (recommended ${recommended?.newVersion ?? 'none'})`;
    const notes = release.changesets.map(id => `\`${id}\``).join(', ') || 'maintenance release';
    return `| ${packageLabel(release.name)} | ${release.oldVersion} → **${REGISTRY_VERSION[release.language](release.newVersion)}**${override} | ${release.type} | ${notes} |`;
  });

/** Lists what ships, which changesets it consumes, and which changelogs and docs it edits. */
export const releasePullBody = (
  batch: ReleaseBatch,
  branch: string,
  outputs: ReadonlyArray<string>
) => {
  const { plan } = batch;
  const copy = CHANNEL_COPY[plan.choices.channel];
  const changelogs = outputs.filter(path => path.endsWith('/CHANGELOG.md'));
  const docsChangelog = outputs.filter(path => path.startsWith('docs/content/changelog/'));
  const references = outputs.filter(path =>
    path.startsWith('docs/content/reference/sdk-reference/')
  );
  const link = (path: string) => `[\`${path}\`](${fileUrl(branch, path)})`;
  const sections = [
    NOTE_EXEMPT,
    copy.summary,
    '## What gets released',
    [
      '| Package | Version | Bump | Changesets |',
      '| --- | --- | --- | --- |',
      ...packageRows(plan),
    ].join('\n'),
    copy.notes,
    plan.changesets.map(changesetLine).join('\n') || 'None: this is a maintenance release.',
    ...(plan.retainedChangesets.length
      ? [
          '## Changesets left for a later release',
          'These entries target a language this release skips. Their files stay in `.changeset/` with only these entries.',
          plan.retainedChangesets.map(changesetLine).join('\n'),
        ]
      : []),
    '## Changelog and docs edits',
    [
      `- Docs changelog entry: ${docsChangelog.map(link).join(', ') || 'none'}.`,
      `- Package changelogs: ${changelogs.map(link).join(', ') || 'none'}.`,
      `- Regenerated API references: ${references.map(link).join(', ') || 'none'}.`,
    ].join('\n'),
    '## How this ships',
    [
      `1. Release source is frozen at ${batch.inputBase}. Later \`next\` commits and their changesets wait for the next release.`,
      `2. Review the diff and approve this head. Approval must come from a writer other than the requester (@${batch.requestedBy}). Do not push to this branch: the tag step only accepts the release bot's commit. To change the notes, fix the changesets on \`next\`, close this PR and request a new release.`,
      `3. After approval and green checks, merge this PR. The release workflow rechecks the approval and tags this exact head \`sdk-release/${batch.id}\`; if the check fails, it creates no tag and asks you to revert this PR and request the release again.`,
      '4. The tag run publishes the exact files the `SDK candidate` checks built and the `SDK candidate smoke` checks installed on this PR. If a publish job fails, use "Re-run failed jobs" on that run.',
      copy.afterPublish,
    ].join('\n'),
    `Request: ${issueUrl(batch)}\nPlanning run: ${runUrl(batch.id)}`,
  ];
  return sections.join('\n\n');
};
