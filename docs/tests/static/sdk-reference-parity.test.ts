// The workspace copy follows unreleased SDK source, so page sets, bodies, and
// source URLs may differ. Check snapshot integrity, every frozen-copy invariant,
// and source-link preservation on shared pages.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFrozenSnapshot } from '../../lib/sdk-reference-content';
import { languages, pageNames, snapshotDirectory } from '../../lib/sdk-reference-snapshot';

const docsRoot = fileURLToPath(new URL('../..', import.meta.url));
const sourceLink = '[View source](';

for (const language of languages) {
  test(`${language} reference is frozen: digest, version banner, pins, and source links`, () => {
    const workspace = join(docsRoot, 'content/reference/sdk-reference', language);
    const directory = snapshotDirectory(docsRoot, language);
    const pages = join(directory, 'pages');

    // Digest, plus the properties that make the committed copy the served copy:
    // a banner naming the manifest version, no unpinned install command, and no
    // source link pointing at the moving `next` branch.
    const snapshot = assertFrozenSnapshot(directory, language);

    const snapshotNames = new Set(pageNames(pages));
    for (const name of pageNames(workspace)) {
      if (!name.endsWith('.mdx') || !snapshotNames.has(name)) continue;
      const frozen = readFileSync(join(pages, name), 'utf8');
      if (readFileSync(join(workspace, name), 'utf8').includes(sourceLink)) {
        expect(frozen, name).toContain(sourceLink);
      }
      expect(frozen, name).toContain(`> SDK version \`${snapshot.version}\`.`);
    }
  });
}
