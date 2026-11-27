import { describe, expect, test } from 'bun:test';
import { missingReleaseNotes } from '../ts/scripts/validate-changesets.mjs';

describe('SDK fragment policy', () => {
  const packages = [{ name: '@composio/core', directory: 'ts/packages/core', private: false }];
  test('requires both language entries for changed public source', () => {
    expect(
      missingReleaseNotes(
        ['ts/packages/core/src/index.ts', 'python/composio/core/tools.py'],
        [],
        packages
      )
    ).toEqual(['@composio/core', '@composio/python-sdk']);
    expect(
      missingReleaseNotes(
        ['python/composio/core/tools.py', '.changeset/python-fix.md'],
        [{ id: 'python-fix', releases: [{ name: '@composio/python-sdk', type: 'patch' }] }],
        packages
      )
    ).toEqual([]);
  });
  test('preexisting pending notes cannot cover new public behavior in another PR', () => {
    expect(
      missingReleaseNotes(
        ['python/composio/core/tools.py'],
        [{ id: 'older-note', releases: [{ name: '@composio/python-sdk', type: 'patch' }] }],
        packages
      )
    ).toEqual(['@composio/python-sdk']);
    expect(
      missingReleaseNotes(
        ['ts/packages/core/package.json'],
        [],
        packages,
        '<!-- sdk-release-note-exempt: This release PR applies previously reviewed SDK changes and only updates release metadata and generated documentation. -->'
      )
    ).toEqual([]);
  });
  test('tests, CLI and a meaningful explicit exemption do not require SDK fragments', () => {
    expect(
      missingReleaseNotes(
        [
          'ts/packages/core/test/index.test.ts',
          'python/tests/test_tools.py',
          'ts/packages/cli/src/index.ts',
        ],
        [],
        packages
      )
    ).toEqual([]);
    expect(
      missingReleaseNotes(
        ['python/composio/core/tools.py'],
        [],
        packages,
        '<!-- sdk-release-note-exempt: Internal typing adjustment with no runtime or public signature changes. -->'
      )
    ).toEqual([]);
    expect(
      missingReleaseNotes(
        ['python/composio/core/tools.py'],
        [],
        packages,
        '<!-- sdk-release-note-exempt: none -->'
      )
    ).toEqual(['@composio/python-sdk']);
  });
});

test('Python packaging needs a note, while Python test files do not', () => {
  const packages = [{ name: '@composio/core', directory: 'ts/packages/core', private: false }];
  expect(missingReleaseNotes(['python/setup.py'], [], packages)).toEqual(['@composio/python-sdk']);
  expect(
    missingReleaseNotes(
      [
        'python/composio/integration_test/test_tools.py',
        'python/composio/core/test_models.py',
        'python/composio/core/models_test.py',
      ],
      [],
      packages
    )
  ).toEqual([]);
});
