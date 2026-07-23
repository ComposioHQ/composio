import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  inventoryPublicKb,
  renderAuditCsv,
  renderAuditMarkdown,
  type KbAuditRow,
} from '@/lib/kb/audit';
import {
  assertExactRevision,
  atomicWriteAuditFile,
  resolveAuditRoots,
} from '@/scripts/audit-kb-sections';

const temporaryDirectories: string[] = [];
const REAL_SUPPORT_WORKFLOWS_ROOT =
  '/Users/sohambasu/Documents/composio/support/kb-exploration/support-workflows';
const ALLOWED_AUDIT_STATES = new Set([
  'publish',
  'link-only',
  'needs-verification',
  'exclude',
]);

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

function parseCsvRecords(csv: string): Array<Record<string, string>> {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      record.push(cell);
      cell = '';
    } else if (character === '\n') {
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
    } else if (character !== '\r') {
      cell += character;
    }
  }

  const headers = records.shift();
  if (!headers) return [];
  return records
    .filter((row) => row.length > 1)
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

describe('public KB audit', () => {
  test('classifies every candidate in the pinned public support inventory', () => {
    if (!existsSync(REAL_SUPPORT_WORKFLOWS_ROOT)) return;

    const inventory = inventoryPublicKb(REAL_SUPPORT_WORKFLOWS_ROOT);

    expect(inventory.fileCount).toBe(115);
    expect(inventory.levelTwoSectionCount).toBe(670);
    expect(inventory.bodyOnlyFileCount).toBe(4);

    const auditCsv = resolve(process.cwd(), 'kb/audits/2026-07-22-section-audit.csv');
    expect(existsSync(auditCsv)).toBe(true);

    const rows = parseCsvRecords(readFileSync(auditCsv, 'utf8'));
    expect(rows).toHaveLength(674);
    expect(
      rows.map((row) => ({
        sourcePath: row.source_paths,
        heading: row.source_headings,
      })),
    ).toEqual(
      inventory.candidates.map((candidate) => ({
        sourcePath: candidate.sourcePath,
        heading: candidate.heading ?? '',
      })),
    );
    for (const row of rows) {
      expect(ALLOWED_AUDIT_STATES.has(row.state)).toBe(true);
      expect(row.reason.trim()).not.toBe('');
    }

    const decisions = JSON.parse(
      readFileSync(resolve(process.cwd(), 'kb/audits/2026-07-22-decisions.json'), 'utf8'),
    ) as Record<string, Record<string, string>>;
    const pilotDecisions = Object.values(decisions).filter(
      (decision) => decision.reason === 'This is a verified local pilot guide selected for publication and not yet deployed from this branch.',
    );
    expect(pilotDecisions).toHaveLength(10);
    for (const decision of pilotDecisions) {
      expect(decision.existingUrl.startsWith('/kb/guide/')).toBe(true);
      expect(decision.reason).toContain('verified local pilot guide selected for publication');
      expect(decision.reason).toContain('not yet deployed');
      expect(decision.verificationSource).toBe('Verified local pilot guide on this undeployed branch');
      expect(decision.supportSignal).toBe('Selected local pilot publication');
    }

    const verifiedAuthRows = Object.values(decisions).filter(
      (decision) => decision.existingUrl === '/kb/guide/choose-discordbot-for-bot-token-operations' ||
        decision.existingUrl === '/kb/guide/snowflake-account-id-uses-org-account-format' ||
        decision.existingUrl?.startsWith('/kb/guide/fix-hubspot-') ||
        decision.existingUrl?.startsWith('/kb/guide/choose-current-shopify-') ||
        decision.existingUrl?.startsWith('/kb/guide/target-outlook-') ||
        decision.existingUrl?.startsWith('/kb/guide/google-sheets-') ||
        decision.existingUrl === '/kb/guide/use-primary-for-google-calendar-id' ||
        decision.existingUrl === '/kb/guide/stripe-api-key-connections-require-a-secret-key',
    );
    expect(verifiedAuthRows).toHaveLength(11);
    for (const decision of verifiedAuthRows) {
      expect(decision.state).toBe('publish');
      expect(decision.freshness).toBe('time-sensitive');
      expect(decision.reason).toContain('Current');
      expect(decision.verificationSource).toMatch(/toolkit|documentation|reference|catalog/i);
    }

    const auditMarkdown = readFileSync(
      resolve(process.cwd(), 'kb/audits/2026-07-22-content-gap-audit.md'),
      'utf8',
    );
    expect(auditMarkdown).toContain(
      '`publish` means selected and prepared for publication, not proof of live deployment.',
    );
    expect(auditMarkdown).toContain('This branch is undeployed.');
    expect(auditMarkdown).toContain('Publish: 21');
    expect(auditMarkdown.match(/Choose DiscordBot for bot-token operations and Discord for user-OAuth operations/g)).toHaveLength(1);
  });

  test('records priorities and concrete schema-plus-provider evidence for every Task 4 publish row', () => {
    const decisions = JSON.parse(
      readFileSync(resolve(process.cwd(), 'kb/audits/2026-07-22-decisions.json'), 'utf8'),
    ) as Record<string, Record<string, string | number>>;
    const expected = new Map([
      ['kb/toolkits/hubspot/public.md#hubspot-oauth-token-fetch-400-check-client-secret-and-required-scope-alignment', 84],
      ['kb/toolkits/shopify/public.md#shopify-api-key-admin-token-auth-is-deprecated-use-oauth2-or-s2s-auth-instead', 77],
      ['kb/toolkits/discord/public.md#discord-message-triggers-require-bot-token-auth-but-discord-oauth-trigger-support-has-been-limited', 68],
      ['kb/toolkits/discordbot/public.md#discord-and-discordbot-use-different-token-types', 68],
      ['kb/toolkits/outlook/public.md#for-outlook-shared-mailboxes-pass-the-shared-mailbox-address-as-user-id-mailbox-target', 91],
      ['kb/toolkits/googlesheets/public.md#google-sheets-access-cannot-be-restricted-at-folder-level-through-composio', 84],
      ['kb/toolkits/google_calendar/public.md#use-primary-as-calendar-id-me-is-not-valid-for-calendar-id', 82],
      ['kb/toolkits/googlesheets/public.md#use-full-google-scope-urls-such-as-https-www-googleapis-com-auth-drive-not-shorthand-drive', 77],
      ['kb/toolkits/stripe/public.md#for-stripe-api-key-auth-use-the-stripe-secret-key-from-developers-api-keys-standard-keys', 86],
      ['kb/toolkits/snowflake/public.md#use-one-snowflake-auth-config-per-customer-account-for-multi-tenant-saas-oauth', 83],
      ['kb/toolkits/snowflake/public.md#fetch-connected-account-fields-or-toolkit-metadata-to-discover-snowflake-account-details', 83],
    ]);

    expect(expected.size).toBe(11);
    for (const [id, priority] of expected) {
      const decision = decisions[id];
      expect(decision?.state).toBe('publish');
      expect(Number(decision?.priorityScore)).toBe(priority);
      expect(Number(decision?.priorityScore)).toBeGreaterThan(0);
      expect(String(decision?.verificationSource)).toContain('docs/public/data/toolkits.json');
      expect(String(decision?.verificationSource)).toContain('https://');
    }
  });

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
    expect(markdown).toContain(
      '`publish` means selected and prepared for publication, not proof of live deployment.',
    );
    expect(markdown).toContain(
      '`platform/compliance-data-handling`, Google Classroom, Google Tasks, Kommo, and Linear exist only in `public-kb` relative to current canonical public pages and require canonical proposals plus verification.',
    );
    expect(markdown).toContain(
      'Obsolete consumer-product naming is excluded; any durable consumer fact must be rewritten for Composio For You in canonical support knowledge.',
    );
  });

  test('groups selected source rows that share one guide route', () => {
    const rows = [
      auditRow({
        id: 'kb/toolkits/discord/public.md#discord-message-triggers-require-bot-token-auth',
        sourcePath: 'kb/toolkits/discord/public.md',
        heading: 'Discord message triggers require bot-token auth',
        proposedTitle: 'Choose Discordbot for bot-token operations',
        existingUrl: '/kb/guide/choose-discordbot-for-bot-token-operations',
      }),
      auditRow({
        id: 'kb/toolkits/discordbot/public.md#discord-and-discordbot-use-different-token-types',
        sourcePath: 'kb/toolkits/discordbot/public.md',
        heading: 'Discord and DiscordBot use different token types',
        proposedTitle: 'Choose Discordbot for bot-token operations',
        existingUrl: '/kb/guide/choose-discordbot-for-bot-token-operations',
      }),
    ];
    const inventory = {
      fileCount: 2,
      levelTwoSectionCount: 2,
      bodyOnlyFileCount: 0,
      candidates: rows,
    };

    const markdown = renderAuditMarkdown(inventory, rows);
    const selected = markdown.slice(markdown.indexOf('## Selected first batch'));

    expect(selected.match(/Choose Discordbot for bot-token operations/g)).toHaveLength(1);
    expect(selected).toContain(
      '`kb/toolkits/discord/public.md#discord-message-triggers-require-bot-token-auth`',
    );
    expect(selected).toContain(
      '`kb/toolkits/discordbot/public.md#discord-and-discordbot-use-different-token-types`',
    );
    expect(markdown).toContain('Publish: 2');
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

  test('CLI rejects decision IDs that are absent from the public inventory', () => {
    if (!existsSync(REAL_SUPPORT_WORKFLOWS_ROOT)) return;

    const root = mkdtempSync(join(tmpdir(), 'composio-kb-audit-decisions-'));
    temporaryDirectories.push(root);
    const decisions = join(root, 'decisions.json');
    const outputDir = join(root, 'output');
    writeFileSync(
      decisions,
      JSON.stringify({
        'kb/platform/misspelled/public.md#missing': { state: 'exclude' },
      }),
    );

    const result = spawnSync(
      'bun',
      [
        'scripts/audit-kb-sections.ts',
        '--source-root',
        REAL_SUPPORT_WORKFLOWS_ROOT,
        '--decisions',
        decisions,
        '--output-dir',
        outputDir,
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Decision IDs not present in the public inventory: kb/platform/misspelled/public.md#missing',
    );
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

  test('atomically replaces a destination symlink without changing its source target', () => {
    const root = mkdtempSync(join(tmpdir(), 'composio-kb-audit-write-'));
    temporaryDirectories.push(root);
    const outputDir = join(root, 'output');
    const sourceTarget = join(root, 'canonical-public.md');
    const outputPath = join(outputDir, 'section-audit.csv');
    mkdirSync(outputDir);
    writeFileSync(sourceTarget, 'canonical source content');
    symlinkSync(sourceTarget, outputPath);

    atomicWriteAuditFile(outputDir, 'section-audit.csv', 'audit output');

    expect(readFileSync(sourceTarget, 'utf8')).toBe('canonical source content');
    expect(lstatSync(outputPath).isSymbolicLink()).toBe(false);
    expect(lstatSync(outputPath).isFile()).toBe(true);
    expect(readFileSync(outputPath, 'utf8')).toBe('audit output');
  });

  test('atomically replaces a destination hard link without changing its source inode', () => {
    const root = mkdtempSync(join(tmpdir(), 'composio-kb-audit-write-'));
    temporaryDirectories.push(root);
    const outputDir = join(root, 'output');
    const sourceTarget = join(root, 'canonical-public.md');
    const outputPath = join(outputDir, 'content-gap-audit.md');
    mkdirSync(outputDir);
    writeFileSync(sourceTarget, 'canonical source content');
    linkSync(sourceTarget, outputPath);
    const sourceInode = statSync(sourceTarget).ino;

    atomicWriteAuditFile(outputDir, 'content-gap-audit.md', 'audit output');

    expect(readFileSync(sourceTarget, 'utf8')).toBe('canonical source content');
    expect(statSync(outputPath).ino).not.toBe(sourceInode);
    expect(lstatSync(outputPath).isFile()).toBe(true);
    expect(readFileSync(outputPath, 'utf8')).toBe('audit output');
  });

  test('removes the exclusive temporary file when the final rename fails', () => {
    const root = mkdtempSync(join(tmpdir(), 'composio-kb-audit-write-'));
    temporaryDirectories.push(root);
    const outputDir = join(root, 'output');
    mkdirSync(join(outputDir, 'occupied'), { recursive: true });

    expect(() => atomicWriteAuditFile(outputDir, 'occupied', 'audit output')).toThrow();
    expect(readdirSync(outputDir)).toEqual(['occupied']);
  });
});
