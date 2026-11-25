import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { missingReleaseNotes } from '../ts/scripts/validate-changesets.mjs';

describe('SDK fragment policy', () => {
  const packages = [{ name: '@composio/core', directory: 'ts/packages/core', private: false }];
  test('a stale event base does not include SDK changes from a newer synthetic merge', () => {
    const workflow = z
      .object({
        jobs: z.object({
          'release-note': z.object({
            steps: z.array(
              z.object({
                uses: z.string().optional(),
                with: z.object({ ref: z.string().optional() }).optional(),
              })
            ),
          }),
        }),
      })
      .parse(
        Bun.YAML.parse(
          readFileSync(
            new URL('../.github/workflows/sdk.release.note.yml', import.meta.url),
            'utf8'
          )
        )
      );
    const checkout = workflow.jobs['release-note'].steps.find(step =>
      step.uses?.startsWith('actions/checkout@')
    );
    expect(checkout).toBeDefined();
    const directory = mkdtempSync(join(tmpdir(), 'sdk-release-note-policy-'));
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Release note test',
          '-c',
          'user.email=release-note@example.test',
          '-c',
          'commit.gpgsign=false',
          ...args,
        ],
        { cwd: directory, encoding: 'utf8' }
      ).trim();
    const paths = (base: string, head: string) =>
      git('diff', '--name-only', `${base}...${head}`).split('\n');
    try {
      git('init', '--quiet', '--initial-branch=next');
      mkdirSync(join(directory, 'ts/packages/core/src'), { recursive: true });
      writeFileSync(
        join(directory, 'ts/packages/core/src/index.ts'),
        'export const version = 1;\n'
      );
      git('add', '.');
      git('commit', '--quiet', '-m', 'Base');
      const eventBase = git('rev-parse', 'HEAD');
      git('checkout', '--quiet', '-b', 'docs');
      mkdirSync(join(directory, 'docs'));
      writeFileSync(join(directory, 'docs/guide.mdx'), 'Documentation change.\n');
      git('add', '.');
      git('commit', '--quiet', '-m', 'Docs only');
      const prHead = git('rev-parse', 'HEAD');
      git('checkout', '--quiet', 'next');
      writeFileSync(
        join(directory, 'ts/packages/core/src/index.ts'),
        'export const version = 2;\n'
      );
      git('commit', '--quiet', '-am', 'Later SDK change on next');
      git('merge', '--quiet', '--no-ff', 'docs', '-m', 'Synthetic PR merge');
      const mergeHead = git('rev-parse', 'HEAD');
      expect(missingReleaseNotes(paths(eventBase, mergeHead), [], packages)).toEqual([
        '@composio/core',
      ]);
      const checkedOutHead =
        checkout?.with?.ref === '${{ github.event.pull_request.head.sha }}' ? prHead : mergeHead;
      expect(missingReleaseNotes(paths(eventBase, checkedOutHead), [], packages)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
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
