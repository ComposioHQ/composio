import { describe, expect, it } from 'vitest';
import { normalizeReleaseTag } from 'src/commands/upgrade/upgrade.handler';

describe('upgrade handler: normalizeReleaseTag', () => {
  it.each([
    { input: '0.13.1', expected: '@composio/cli@0.13.1' },
    { input: '0.13.1-beta.42', expected: '@composio/cli@0.13.1-beta.42' },
    { input: 'v0.13.1', expected: '@composio/cli@0.13.1' },
    { input: '  0.13.1  ', expected: '@composio/cli@0.13.1' },
    { input: '@composio/cli@0.13.1', expected: '@composio/cli@0.13.1' },
    { input: ' @composio/cli@0.13.1-beta.42 ', expected: '@composio/cli@0.13.1-beta.42' },
    // Only one leading `v` is dropped; the rest is passed through for the release lookup to reject.
    { input: 'vv1', expected: '@composio/cli@v1' },
  ])('[Given] "$input" [Then] returns "$expected"', ({ input, expected }) => {
    expect(normalizeReleaseTag(input)).toBe(expected);
  });
});
