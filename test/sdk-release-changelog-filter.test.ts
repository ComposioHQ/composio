import { afterAll, expect, test } from 'bun:test';
import { run } from '../scripts/sdk-release/runtime';
import { resolvePath, runRelease, temporaryDirectories, writeText } from './sdk-release-harness';

const changelogs = temporaryDirectories('sdk-changelog-filter-');
afterAll(() => changelogs.cleanup());

test('only the SDK frontmatter marker suppresses ordinary changelog automation', async () => {
  const directory = await changelogs.create();
  const ordinary = `${directory}/ordinary.mdx`;
  const release = `${directory}/release.mdx`;
  await writeText(
    ordinary,
    '---\ntitle: Ordinary\ndate: "2026-11-03"\n---\nsdkRelease: in prose\n'
  );
  await writeText(release, '---\ntitle: Release\nsdkRelease: "51"\n---\nChanges\n');
  const kept = await runRelease(
    run('bash', [
      '-c',
      `printf '%s\\n' "$0" "$1" | bash "$2"`,
      ordinary,
      release,
      await resolvePath('scripts/sdk-release/changelog-filter.sh'),
    ])
  );
  expect(kept).toBe(`${ordinary}\n`);
});
