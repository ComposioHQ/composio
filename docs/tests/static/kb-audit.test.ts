import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inventoryPublicKb,
  renderAuditCsv,
  renderAuditMarkdown,
  type KbAuditRow,
} from '@/lib/kb/audit';
import { assertExactRevision, resolveAuditRoots } from '@/scripts/audit-kb-sections';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function publicDocument(title: string, body: string): string {
  return `---
type: reference
title: ${title}
description: Public example.
category: platform/example
visibility: public
timestamp: 2026-07-20T00:00:00Z
tags:
  - example
---
${body}
`;
}

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'composio-kb-audit-'));
  temporaryDirectories.push(root);

  const sectioned = join(root, 'kb/platform/example');
  const bodyOnly = join(root, 'kb/platform/z-body-only');
  mkdirSync(sectioned, { recursive: true });
  mkdirSync(bodyOnly, { recursive: true });
  writeFileSync(
    join(sectioned, 'public.md'),
    publicDocument(
      'Example answers',
      `# Example answers

## First answer

First public answer.

## Second answer

Second public answer.
`,
    ),
  );
  writeFileSync(
    join(sectioned, 'private.md'),
    'private-only phrase: this file must never be opened',
  );
  writeFileSync(
    join(bodyOnly, 'public.md'),
    publicDocument('Body-only answer', '# Body-only answer\n\nThis is the full public answer.'),
  );
  writeFileSync(
    join(bodyOnly, 'private.md'),
    'private-only phrase: this file must never be opened',
  );
  return root;
}

function auditRow(overrides: Partial<KbAuditRow> = {}): KbAuditRow {
  return {
    id: 'kb/platform/example/public.md#first-answer',
    sourcePath: 'kb/platform/example/public.md',
    sourceTitle: 'Example answers',
    heading: 'First answer',
    body: 'First public answer.',
    category: 'platform/example',
    tags: ['example'],
    proposedTitle: 'Proposed, "quoted" title',
    state: 'publish',
    reason: 'Ready, after verification',
    existingUrl: '',
    freshness: 'evergreen',
    verificationSource: 'Official docs',
    supportSignal: 'Frequently requested',
    priorityScore: 9,
    ...overrides,
  };
}

describe('public KB audit', () => {
  test('inventories only public documents and preserves section order', () => {
    const root = createFixture();

    const inventory = inventoryPublicKb(root);

    expect(inventory.fileCount).toBe(2);
    expect(inventory.levelTwoSectionCount).toBe(2);
    expect(inventory.bodyOnlyFileCount).toBe(1);
    expect(inventory.candidates.map((item) => item.heading)).toEqual([
      'First answer',
      'Second answer',
      null,
    ]);
    expect(inventory.candidates.map((item) => item.id)).toEqual([
      'kb/platform/example/public.md#first-answer',
      'kb/platform/example/public.md#second-answer',
      'kb/platform/z-body-only/public.md#body',
    ]);
    expect(JSON.stringify(inventory)).not.toContain('private-only phrase');
  });

  test('renders quoted CSV cells and state counts in the Markdown report', () => {
    const rows = [
      auditRow(),
      auditRow({
        id: 'kb/platform/example/public.md#second-answer',
        heading: 'Second answer',
        proposedTitle: 'Hold this answer',
        state: 'needs-verification',
        priorityScore: 3,
      }),
    ];
    const inventory = {
      fileCount: 2,
      levelTwoSectionCount: 2,
      bodyOnlyFileCount: 1,
      candidates: rows,
    };

    expect(renderAuditCsv(rows)).toBe(
      [
        'source_paths,source_headings,proposed_title,state,reason,existing_url,freshness,verification_source,support_signal,priority_score',
        'kb/platform/example/public.md,First answer,"Proposed, ""quoted"" title",publish,"Ready, after verification",,evergreen,Official docs,Frequently requested,9',
        'kb/platform/example/public.md,Second answer,Hold this answer,needs-verification,"Ready, after verification",,evergreen,Official docs,Frequently requested,3',
        '',
      ].join('\n'),
    );

    const markdown = renderAuditMarkdown(inventory, rows);
    expect(markdown).toContain('Source commit: `5eed614`');
    expect(markdown).toContain('Publish: 1');
    expect(markdown).toContain('Needs verification: 1');
    expect(markdown).toContain('Selected first batch');
    expect(markdown).toContain('Risk themes');
    expect(markdown).toContain('Noncanonical archive findings');
  });

  test('CLI rejects a relative source checkout path', () => {
    const result = spawnSync(
      'bun',
      ['scripts/audit-kb-sections.ts', '--source-root', 'support-workflows'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--source-root must be an absolute path');
  });

  test('rejects an output symlink that resolves inside the source checkout before writing', () => {
    const root = mkdtempSync(join(tmpdir(), 'composio-kb-audit-paths-'));
    temporaryDirectories.push(root);
    const sourceRoot = join(root, 'support-workflows');
    const sourceOutputTarget = join(sourceRoot, 'audit-output');
    const outputAlias = join(root, 'output-alias');
    mkdirSync(sourceOutputTarget, { recursive: true });
    symlinkSync(sourceOutputTarget, outputAlias, 'dir');
    const requestedOutput = join(outputAlias, 'not-created');

    expect(() => resolveAuditRoots(sourceRoot, requestedOutput)).toThrow(
      '--output-dir must not overlap --source-root',
    );
    expect(existsSync(join(sourceOutputTarget, 'not-created'))).toBe(false);
  });

  test('requires the resolved HEAD and pinned commit to match exactly', () => {
    expect(() =>
      assertExactRevision(
        '5eed614000000000000000000000000000000000',
        '5eed614fffffffffffffffffffffffffffffffff',
      ),
    ).toThrow('--source-root must be checked out at 5eed614');
    expect(() =>
      assertExactRevision(
        '5eed614fffffffffffffffffffffffffffffffff',
        '5eed614fffffffffffffffffffffffffffffffff',
      ),
    ).not.toThrow();
  });
});
