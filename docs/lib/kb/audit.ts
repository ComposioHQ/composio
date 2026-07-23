import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { extractGuideBody, parsePublicKbDocument } from './source-document';

export type KbAuditState = 'publish' | 'link-only' | 'needs-verification' | 'exclude';

export interface KbAuditCandidate {
  id: string;
  sourcePath: string;
  sourceTitle: string;
  heading: string | null;
  body: string;
  category: string;
  tags: string[];
}

export interface KbAuditRow extends KbAuditCandidate {
  proposedTitle: string;
  state: KbAuditState;
  reason: string;
  existingUrl: string;
  freshness: '' | 'evergreen' | 'time-sensitive';
  verificationSource: string;
  supportSignal: string;
  priorityScore: number;
}

export interface KbAuditInventory {
  fileCount: number;
  levelTwoSectionCount: number;
  bodyOnlyFileCount: number;
  candidates: KbAuditCandidate[];
}

export const AUDIT_COLUMNS = [
  'source_paths',
  'source_headings',
  'proposed_title',
  'state',
  'reason',
  'existing_url',
  'freshness',
  'verification_source',
  'support_signal',
  'priority_score',
] as const;

const SOURCE_COMMIT = '5eed614';

function normalizeHeading(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sourceRelativePath(sourceRoot: string, parentPath: string): string {
  return relative(sourceRoot, join(parentPath, 'public.md')).split(sep).join('/');
}

function levelTwoSections(body: string): Array<{ heading: string; body: string }> {
  const lines = body.split('\n');
  const sections = lines.flatMap((line, index) => {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (!match?.[1]) return [];
    return [{ index, heading: match[1].trim() }];
  });

  return sections.map((section, index) => {
    const end = sections[index + 1]?.index ?? lines.length;
    return {
      heading: section.heading,
      body: lines.slice(section.index + 1, end).join('\n').trim(),
    };
  });
}

export function inventoryPublicKb(sourceRoot: string): KbAuditInventory {
  const kbRoot = join(sourceRoot, 'kb');
  const publicFiles = readdirSync(kbRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === 'public.md')
    .map((entry) => ({
      absolutePath: join(entry.parentPath, entry.name),
      sourcePath: sourceRelativePath(sourceRoot, entry.parentPath),
    }))
    .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));

  let levelTwoSectionCount = 0;
  let bodyOnlyFileCount = 0;
  const candidates: KbAuditCandidate[] = [];

  for (const file of publicFiles) {
    const document = parsePublicKbDocument(readFileSync(file.absolutePath, 'utf8'));
    if (document.metadata.visibility !== 'public') {
      throw new Error(`${file.sourcePath} is not visibility: public`);
    }

    const sections = levelTwoSections(document.body);
    levelTwoSectionCount += sections.length;
    if (sections.length === 0) {
      bodyOnlyFileCount += 1;
      candidates.push({
        id: `${file.sourcePath}#body`,
        sourcePath: file.sourcePath,
        sourceTitle: document.metadata.title,
        heading: null,
        body: extractGuideBody(document, null),
        category: document.metadata.category,
        tags: document.metadata.tags,
      });
      continue;
    }

    for (const section of sections) {
      candidates.push({
        id: `${file.sourcePath}#${normalizeHeading(section.heading)}`,
        sourcePath: file.sourcePath,
        sourceTitle: document.metadata.title,
        heading: section.heading,
        body: section.body,
        category: document.metadata.category,
        tags: document.metadata.tags,
      });
    }
  }

  return {
    fileCount: publicFiles.length,
    levelTwoSectionCount,
    bodyOnlyFileCount,
    candidates,
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function renderAuditCsv(rows: KbAuditRow[]): string {
  const lines = rows.map((row) =>
    [
      row.sourcePath,
      row.heading ?? '',
      row.proposedTitle,
      row.state,
      row.reason,
      row.existingUrl,
      row.freshness,
      row.verificationSource,
      row.supportSignal,
      row.priorityScore,
    ]
      .map(csvCell)
      .join(','),
  );
  return [AUDIT_COLUMNS.join(','), ...lines].join('\n') + '\n';
}

function titleCaseState(state: KbAuditState): string {
  return state === 'needs-verification'
    ? 'Needs verification'
    : state.slice(0, 1).toUpperCase() + state.slice(1).replace('-', ' ');
}

function groupSelectedRows(rows: KbAuditRow[]): KbAuditRow[][] {
  const groups = new Map<string, KbAuditRow[]>();
  for (const row of rows) {
    const route = row.existingUrl || row.id;
    const group = groups.get(route) ?? [];
    group.push(row);
    groups.set(route, group);
  }
  return [...groups.values()];
}

function renderSelectedGroups(groups: KbAuditRow[][], emptyMessage: string): string[] {
  return groups.length
    ? groups.map((group) => {
        const [first] = group;
        return `- ${first?.proposedTitle} — ${group.map((row) => `\`${row.id}\``).join(', ')}`;
      })
    : [emptyMessage];
}

export function renderAuditMarkdown(inventory: KbAuditInventory, rows: KbAuditRow[]): string {
  const counts = new Map<KbAuditState, number>();
  for (const state of ['publish', 'link-only', 'needs-verification', 'exclude'] as const) {
    counts.set(state, rows.filter((row) => row.state === state).length);
  }
  const firstBatch = rows
    .filter((row) => row.state === 'publish')
    .sort(
      (left, right) =>
        right.priorityScore - left.priorityScore ||
        left.sourcePath.localeCompare(right.sourcePath) ||
        left.id.localeCompare(right.id),
    );
  const pilotGroups = groupSelectedRows(firstBatch.filter((row) => row.priorityScore === 0));
  const newlyVerifiedGroups = groupSelectedRows(firstBatch.filter((row) => row.priorityScore > 0));

  return [
    '# Public KB content-gap audit',
    '',
    `Source commit: \`${SOURCE_COMMIT}\``,
    `Inventory totals: ${inventory.fileCount} public files, ${inventory.levelTwoSectionCount} level-two sections, and ${inventory.bodyOnlyFileCount} body-only candidates.`,
    '',
    '## Classification counts',
    '',
    ...(['publish', 'link-only', 'needs-verification', 'exclude'] as const).map(
      (state) => `- ${titleCaseState(state)}: ${counts.get(state) ?? 0}`,
    ),
    '',
    '## Publication meaning',
    '',
    '- `publish` means selected and prepared for publication, not proof of live deployment.',
    '- This branch is undeployed.',
    '',
    '## Selected first batch',
    '',
    `## Existing undeployed pilot articles (${pilotGroups.length})`,
    '',
    ...renderSelectedGroups(pilotGroups, '- No existing undeployed pilot articles are selected.'),
    '',
    `## Newly verified articles (${newlyVerifiedGroups.length})`,
    '',
    ...renderSelectedGroups(newlyVerifiedGroups, '- No newly verified articles are selected.'),
    '',
    '## Risk themes',
    '',
    '- Hold unverified product limits, provider behavior, and time-sensitive operational claims until authoritative sources confirm them.',
    '- Exclude resolved incidents and internal-only guidance from publication candidates.',
    '',
    '## Noncanonical archive findings',
    '',
    '- `platform/compliance-data-handling`, Google Classroom, Google Tasks, Kommo, and Linear exist only in `public-kb` relative to current canonical public pages and require canonical proposals plus verification.',
    '- `routing` is internal and excluded.',
    '- Obsolete consumer-product naming is excluded; any durable consumer fact must be rewritten for Composio For You in canonical support knowledge.',
    '- `README` and `index` are navigation, not article candidates.',
    '',
  ].join('\n');
}
