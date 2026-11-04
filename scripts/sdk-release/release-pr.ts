import { SDK_RELEASE_REPOSITORY } from './github';
import { PYTHON_RELEASE_MARKER } from './lanes';
import type { ReleaseBatch } from './source';

/** Identifies the controller's release PR; reviewers must not remove it. */
export const RELEASE_PR_MARKER = '<!-- sdk-release-batch -->';
const NOTE_EXEMPT =
  '<!-- sdk-release-note-exempt: This release PR applies previously reviewed SDK changes and only updates release metadata and generated documentation. -->';
const SUMMARY_LIMIT = 200;

type Plan = ReleaseBatch['plan'];
type Changeset = Plan['changesets'][number];

const repositoryUrl = `https://github.com/${SDK_RELEASE_REPOSITORY}`;
const runUrl = (id: string) => `${repositoryUrl}/actions/runs/${id}`;
const fileUrl = (branch: string, path: string) =>
  `${repositoryUrl}/${path.endsWith('/') ? 'tree' : 'blob'}/${branch}/${path}`;

const packageLabel = (name: string) =>
  name === PYTHON_RELEASE_MARKER ? 'Python SDK (`composio` and every provider)' : `\`${name}\``;

/** Shows contributor text literally, so it cannot hide or add content in the reviewed body. */
const escapeMarkdown = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/[\\`*_[\]()|#!]/g, '\\$&');

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

const packageRows = (plan: Plan) =>
  plan.releases.map(release => {
    const recommended = plan.recommended.find(candidate => candidate.name === release.name);
    const override =
      recommended?.newVersion === release.newVersion
        ? ''
        : ` (recommended ${recommended?.newVersion ?? 'none'})`;
    const notes = release.changesets.map(id => `\`${id}\``).join(', ') || 'maintenance release';
    return `| ${packageLabel(release.name)} | ${release.oldVersion} → **${release.newVersion}**${override} | ${release.type} | ${notes} |`;
  });

/** Lists what ships, which changesets it consumes, and which changelogs and docs it edits. */
export const releasePullBody = (batch: ReleaseBatch, branch: string) => {
  const { plan } = batch;
  const changelogs = batch.outputs.filter(path => path.endsWith('/CHANGELOG.md'));
  const docsChangelog = batch.outputs.filter(path => path.startsWith('docs/content/changelog/'));
  const references = batch.outputs.filter(path =>
    path.startsWith('docs/content/reference/sdk-reference/')
  );
  const link = (path: string) => `[\`${path}\`](${fileUrl(branch, path)})`;
  const sections = [
    `${RELEASE_PR_MARKER}\n${NOTE_EXEMPT}`,
    '## What gets released',
    [
      '| Package | Version | Bump | Changesets |',
      '| --- | --- | --- | --- |',
      ...packageRows(plan),
    ].join('\n'),
    '## Changesets consumed',
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
      `- Docs changelog entry: ${docsChangelog.map(link).join(', ') || 'none'}. Edit its narrative here before approving; the published docs show it as written.`,
      `- Package changelogs: ${changelogs.map(link).join(', ') || 'none'}.`,
      `- Regenerated API references: ${references.map(link).join(', ') || 'none'}.`,
    ].join('\n'),
    '## How this ships',
    [
      `1. Release source is frozen at ${batch.inputBase}. Later \`next\` commits and their changesets wait for the next release.`,
      '2. Review the full diff and approve the final head. Any new commit needs a new approval.',
      `3. After checks pass, the controller merges this exact head and tags it \`sdk-release/${batch.id}\`.`,
      '4. The tag run publishes the exact files the `SDK candidate` checks built on this PR, then verifies the public packages and the live docs changelog.',
      '5. A follow-up docs PR updates guides and version pins for the released packages.',
    ].join('\n'),
    `Request: ${batch.statusUrl}\nPreparation run: ${runUrl(batch.originalRunId)}`,
  ];
  return sections.join('\n\n');
};
