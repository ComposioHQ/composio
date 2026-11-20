import { expect, test } from 'bun:test';
import { rollChangelog } from './update-changelog';

const header = '# @composio/cli\n\n## Unreleased\n';
const history = '\n## 0.5.0\n\n- Earlier release.\n';
const repository = 'ComposioHQ/composio';

test('files each note under the stable release that shipped it', () => {
  const baseline = {
    tag: '@composio/cli@0.5.0',
    markdown: header + history,
  };
  const first = {
    tag: '@composio/cli@0.6.0',
    markdown: header + '\n### Minor Changes\n\n- A feature.\n  With more detail.\n' + history,
  };
  const second = {
    tag: '@composio/cli@0.6.1',
    markdown: first.markdown.replace(
      '### Minor Changes',
      '### Patch Changes\n\n- A fix.\n\n### Minor Changes'
    ),
  };
  const current = second.markdown.replace(
    '### Patch Changes',
    '### Patch Changes\n\n- Pending fix.'
  );
  const updated = rollChangelog(current, [baseline, first, second], repository);

  expect(updated).toStartWith(header + '\n### Patch Changes\n\n- Pending fix.\n\n## 0.6.1\n');
  expect(updated).toContain('## 0.6.1\n\n### Patch Changes\n\n- A fix.\n');
  expect(updated).toContain('## 0.6.0\n\n### Minor Changes\n\n- A feature.\n  With more detail.\n');
  expect(updated.match(/- A feature\./g)).toHaveLength(1);
  expect(updated).toEndWith(history);
  expect(rollChangelog(updated, [second], repository)).toBe(updated);
});

test('uses released notes even after the prior release was rolled on next', () => {
  const first = {
    tag: '@composio/cli@0.6.0',
    markdown: header + '\n- Previously shipped.\n' + history,
  };
  const current = header + '\n- Pending fix.\n\n## 0.6.0\n\n- Previously shipped.\n' + history;
  const second = {
    tag: '@composio/cli@0.6.1',
    // A release branch can carry a note that has not landed on next.
    markdown:
      header +
      '\n- A fix from the release branch.\n\n## 0.6.0\n\n- Previously shipped.\n' +
      history,
  };
  const updated = rollChangelog(current, [first, second], repository);

  expect(updated).toStartWith(
    header + '\n- Pending fix.\n\n## 0.6.1\n\n- A fix from the release branch.\n'
  );
  expect(updated.match(/- Previously shipped\./g)).toHaveLength(1);
});
