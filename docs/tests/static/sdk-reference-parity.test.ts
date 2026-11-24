// The workspace copy follows unreleased SDK source, so page sets, bodies, and
// source URLs may differ. Check snapshot integrity, each copy's structure,
// and source-link preservation on shared pages.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { languages, pageNames, snapshotDirectory, verifySnapshot } from '../../lib/sdk-reference-snapshot';

const docsRoot = fileURLToPath(new URL('../..', import.meta.url));
const sourceLink = '[View source](';

for (const language of languages) {
  test(`${language} reference verifies snapshot integrity, page structure, and shared source links`, () => {
    const workspace = join(docsRoot, 'content/reference/sdk-reference', language);
    const directory = snapshotDirectory(docsRoot, language);
    const snapshot = join(directory, 'pages');

    verifySnapshot(directory);
    const workspaceNames = pageNames(workspace);
    const snapshotNames = new Set(pageNames(snapshot));

    for (const name of workspaceNames) {
      if (!name.endsWith('.mdx') || !snapshotNames.has(name)) continue;
      if (readFileSync(join(workspace, name), 'utf8').includes(sourceLink)) {
        expect(readFileSync(join(snapshot, name), 'utf8'), name).toContain(sourceLink);
      }
    }
  });
}
