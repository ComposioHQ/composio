import { expect, test } from 'bun:test';
import { releasePullBody } from '../scripts/sdk-release/release-pr';
import type { ReleaseBatch } from '../scripts/sdk-release/source';

const release = (
  name: string,
  language: 'typescript' | 'python',
  newVersion: string,
  changesets: string[]
) => ({
  name,
  language,
  type: 'minor' as const,
  oldVersion: '1.0.0',
  newVersion,
  changesets,
});

const outputs = [
  'docs/content/changelog/11-04-26-sdk-8.mdx',
  'docs/content/reference/sdk-reference/typescript/',
  'python/CHANGELOG.md',
  'ts/packages/core/CHANGELOG.md',
];

const batch: ReleaseBatch = {
  id: '8',
  inputBase: 'a'.repeat(40),
  requestedBy: 'requester',
  issue: 7,
  date: '2026-11-04',
  plan: {
    schemaVersion: 1,
    inputFingerprint: 'frozen',
    choices: { typescript: 'auto', python: 'minor' },
    recommended: [
      release('@composio/core', 'typescript', '1.1.0', ['brave-cats']),
      release('@composio/python-sdk', 'python', '1.0.1', []),
    ],
    releases: [
      release('@composio/core', 'typescript', '1.1.0', ['brave-cats']),
      release('@composio/python-sdk', 'python', '1.1.0', []),
    ],
    changesets: [
      {
        id: 'brave-cats',
        summary: 'Add session tool filters.\n\nLonger explanation.',
        releases: [{ name: '@composio/core', type: 'minor' }],
      },
    ],
    retainedChangesets: [
      {
        id: 'quiet-dogs',
        summary: 'Rename an internal helper.',
        releases: [{ name: '@composio/slim', type: 'patch' }],
      },
    ],
  },
};

test('the release PR names every package, consumed changeset and edited changelog', () => {
  const body = releasePullBody(batch, 'sdk-release/batch-8', outputs);
  const blob = 'https://github.com/ComposioHQ/composio/blob/sdk-release/batch-8';
  expect(body).toContain('| `@composio/core` | 1.0.0 → **1.1.0** | minor | `brave-cats` |');
  expect(body).toContain(
    '| Python SDK (`composio` and every provider) | 1.0.0 → **1.1.0** (recommended 1.0.1) | minor | maintenance release |'
  );
  expect(body).toContain(
    '- `.changeset/brave-cats.md` (`@composio/core` minor): Add session tool filters.'
  );
  expect(body).toContain('## Changesets left for a later release');
  expect(body).toContain('- `.changeset/quiet-dogs.md` (`@composio/slim` patch)');
  expect(body).toContain(
    `- Docs changelog entry: [\`docs/content/changelog/11-04-26-sdk-8.mdx\`](${blob}/docs/content/changelog/11-04-26-sdk-8.mdx)`
  );
  expect(body).toContain(
    `[\`ts/packages/core/CHANGELOG.md\`](${blob}/ts/packages/core/CHANGELOG.md)`
  );
  expect(body).toContain(
    'https://github.com/ComposioHQ/composio/tree/sdk-release/batch-8/docs/content/reference/sdk-reference/typescript/'
  );
  expect(body).toContain('(@requester)');
  expect(body).toContain('`sdk-release/8`');
  expect(body).toContain('https://github.com/ComposioHQ/composio/issues/7');
});

test('changeset text cannot hide or add content in the release PR', () => {
  const body = releasePullBody(
    {
      ...batch,
      plan: {
        ...batch.plan,
        changesets: [
          {
            id: 'sneaky',
            summary: 'Fix crash <!-- [click](https://evil.test) | `x`',
            releases: [{ name: '@composio/core', type: 'patch' }],
          },
        ],
      },
    },
    'sdk-release/batch-8',
    outputs
  );
  expect(body).toContain('Fix crash &lt;\\!-- \\[click\\]\\(https://evil.test\\) \\| \\`x\\`');
  expect(body).not.toContain('<!-- [click]');
});

test('a package name cannot break out of its code span in the release PR', () => {
  const forged = '@composio/x` [click](https://evil.test)';
  const body = releasePullBody(
    {
      ...batch,
      plan: {
        ...batch.plan,
        recommended: [release(forged, 'typescript', '1.1.0', [])],
        releases: [release(forged, 'typescript', '1.1.0', [])],
      },
    },
    'sdk-release/batch-8',
    outputs
  );
  expect(body).toContain('| @composio/x\\` \\[click\\]\\(https://evil.test\\) | 1.0.0 → **1.1.0**');
  expect(body).not.toContain('[click](https://evil.test)');
});
