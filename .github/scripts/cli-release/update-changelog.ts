import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'ts/packages/cli/CHANGELOG.md';
const tagPrefix = '@composio/cli@';
const stableTag = /^@composio\/cli@(\d+\.\d+\.\d+)$/;
const header = '# @composio/cli\n\n## Unreleased';

type Note = { heading: string; text: string };

function splitChangelog(markdown: string) {
  const boundary = markdown.indexOf('\n## ', header.length);
  return {
    unreleased: markdown.slice(header.length, boundary < 0 ? undefined : boundary),
    history: boundary < 0 ? '' : markdown.slice(boundary + 1),
  };
}

function pendingNotes(markdown: string): Note[] {
  // Older stable tags predate the Unreleased section.
  if (!markdown.startsWith(header + '\n')) return [];

  const notes: Note[] = [];
  let heading = '';
  const { unreleased } = splitChangelog(markdown);
  for (const block of unreleased.split(/(?=^### |^- )/m)) {
    const text = block.trimEnd();
    if (!text) continue;
    if (text.startsWith('### ') && !text.includes('\n')) {
      heading = text;
    } else if (text.startsWith('- ')) {
      notes.push({ heading, text });
    } else {
      throw new Error(`Unexpected Unreleased content: ${text}`);
    }
  }
  return notes;
}

function withoutNotes(notes: Note[], removed: Note[]): Note[] {
  const counts = new Map<string, number>();
  for (const { text } of removed) counts.set(text, (counts.get(text) ?? 0) + 1);

  return notes.filter(({ text }) => {
    const count = counts.get(text) ?? 0;
    if (count === 0) return true;
    counts.set(text, count - 1);
    return false;
  });
}

function renderNotes(notes: Note[]): string {
  const blocks: string[] = [];
  let previousHeading = '';
  for (const { heading, text } of notes) {
    if (heading && heading !== previousHeading) blocks.push(heading);
    blocks.push(text);
    previousHeading = heading;
  }
  return blocks.join('\n\n');
}

export function rollChangelog(
  current: string,
  releases: { tag: string; markdown: string }[],
  repository: string
): string {
  if (!current.startsWith(header + '\n')) {
    throw new Error('CLI changelog is missing its Unreleased section');
  }
  if (releases.length < 2) return current;

  let { history } = splitChangelog(current);
  let pending = pendingNotes(current);
  // Version sections contain both notes and standalone text such as compare links.
  const previouslyShipped = new Set(
    history
      .split(/(?=^#{2,3} |^- |^\n\S)/m)
      .filter(block => block.startsWith('- '))
      .map(block => block.trimEnd())
  );

  for (let index = 1; index < releases.length; index++) {
    const previous = releases[index - 1];
    const release = releases[index];
    const version = release.tag.slice(tagPrefix.length);
    for (const { text } of pendingNotes(previous.markdown)) previouslyShipped.add(text);
    const releaseNotes = pendingNotes(release.markdown);
    const shipped = releaseNotes.filter(({ text }) => !previouslyShipped.has(text));
    pending = withoutNotes(pending, releaseNotes);
    const notes = renderNotes(shipped);
    const compare = `[Compare with ${previous.tag.slice(tagPrefix.length)}](https://github.com/${repository}/compare/${encodeURIComponent(previous.tag)}...${encodeURIComponent(release.tag)})`;
    history = [`## ${version}`, notes, compare, history].filter(Boolean).join('\n\n');
  }

  return [header, renderNotes(pending), history].filter(Boolean).join('\n\n');
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
}

if (import.meta.main) {
  const repository = process.env.GH_REPO ?? 'ComposioHQ/composio';
  const current = readFileSync(path, 'utf8');
  const version = splitChangelog(current).history.match(/^## (\d+\.\d+\.\d+)\n/)?.[1];
  if (!version) throw new Error('CLI changelog is missing its latest stable version');

  // gh supplies published stable releases. Sort the matching, checked-out tags
  // numerically and use only the releases after the last documented version.
  const published = new Set(process.argv.slice(2).filter(tag => stableTag.test(tag)));
  const tags = git('tag', '--list', '--sort=version:refname', '@composio/cli@*')
    .trim()
    .split('\n')
    .filter(tag => published.has(tag));
  if (tags.length !== published.size)
    throw new Error('Published CLI release tags are missing locally');
  const baseline = tags.indexOf(tagPrefix + version);
  if (baseline === -1) throw new Error(`No published CLI release found for ${version}`);
  // A manually built beta may come from a release branch outside next.
  const releases = tags.slice(baseline).map(tag => ({
    tag,
    markdown: git('show', `refs/tags/${tag}:${path}`),
  }));
  writeFileSync(path, rollChangelog(current, releases, repository));
}
