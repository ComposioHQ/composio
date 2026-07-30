import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ChangelogCollectionSchema, type ChangelogCollection } from './collect-changelog-input';

const SourceIdsSchema = z
  .array(z.string().min(1).max(80))
  .min(1)
  .max(8)
  .superRefine((sourceIds, context) => {
    if (new Set(sourceIds).size !== sourceIds.length) {
      context.addIssue({ code: 'custom', message: 'source IDs must be unique' });
    }
  });
const ClaimSchema = z
  .object({
    text: z.string().min(1).max(400),
    source_ids: SourceIdsSchema,
  })
  .strict();
const BreakingClaimSchema = z
  .object({
    text: z.string().min(1).max(400),
    source_ids: SourceIdsSchema,
    migration: z.string().min(1).max(600),
    migration_source_ids: SourceIdsSchema,
  })
  .strict();
const OrdinarySectionSchema = z
  .object({
    kind: z.enum(['whats_new', 'improvements', 'bug_fixes']),
    claims: z.array(ClaimSchema).min(1).max(12),
  })
  .strict();
const BreakingSectionSchema = z
  .object({
    kind: z.literal('breaking_changes'),
    claims: z.array(BreakingClaimSchema).min(1).max(12),
  })
  .strict();

export const ChangelogOutputSchema = z
  .object({
    schema_version: z.literal('sdk-release-changelog/v1'),
    summary: z
      .object({
        text: z.string().min(1).max(600),
        source_ids: SourceIdsSchema,
      })
      .strict(),
    sections: z
      .array(z.discriminatedUnion('kind', [OrdinarySectionSchema, BreakingSectionSchema]))
      .max(4),
  })
  .strict()
  .superRefine((output, context) => {
    const kinds = output.sections.map(section => section.kind);
    if (new Set(kinds).size !== kinds.length) {
      context.addIssue({
        code: 'custom',
        path: ['sections'],
        message: 'section kinds must be unique',
      });
    }
  });

export type ChangelogOutput = z.infer<typeof ChangelogOutputSchema>;

const SECTION_ORDER = ['whats_new', 'improvements', 'bug_fixes', 'breaking_changes'] as const;
const SECTION_HEADINGS: Record<(typeof SECTION_ORDER)[number], string> = {
  whats_new: "What's New",
  improvements: 'Improvements',
  bug_fixes: 'Bug Fixes',
  breaking_changes: 'Breaking Changes',
};

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertSourceIds(
  sourceIds: readonly string[],
  allowlist: ReadonlySet<string>,
  field: string
): void {
  for (const sourceId of sourceIds) {
    if (!allowlist.has(sourceId)) {
      throw new Error(`${field} references non-allowlisted source ID: ${sourceId}`);
    }
  }
}

function modelText(output: ChangelogOutput): string[] {
  return [
    output.summary.text,
    ...output.sections.flatMap(section =>
      section.claims.flatMap(claim => [
        claim.text,
        ...('migration' in claim ? [claim.migration] : []),
      ])
    ),
  ];
}

export function validateChangelogOutput(
  value: unknown,
  rawInput: ChangelogCollection
): ChangelogOutput {
  const input = ChangelogCollectionSchema.parse(rawInput);
  const output = ChangelogOutputSchema.parse(value);
  const allowlist = new Set(input.sources.map(source => source.id));
  assertSourceIds(output.summary.source_ids, allowlist, 'summary');

  for (const section of output.sections) {
    for (const claim of section.claims) {
      assertSourceIds(claim.source_ids, allowlist, `${section.kind} claim`);
      if ('migration_source_ids' in claim) {
        assertSourceIds(claim.migration_source_ids, allowlist, 'breaking migration');
        const evidence = input.sources
          .filter(source => claim.migration_source_ids.includes(source.id))
          .map(source => `${source.title}\n${source.body}`)
          .join('\n');
        if (
          !/\b(?:break(?:ing)?|migrat(?:e|ion)|deprecat(?:e|ed|ion)|replacement)\b/i.test(evidence)
        ) {
          throw new Error('Breaking claim is missing explicit migration evidence');
        }
      }
    }
  }

  const generatedText = modelText(output);
  for (const text of generatedText) {
    if (/https?:\/\/|www\./i.test(text)) {
      throw new Error('Model output must not contain URLs');
    }
    for (const releasePackage of input.packages) {
      if (text.includes(releasePackage.version)) {
        throw new Error('Model output must not choose or repeat package versions');
      }
    }
  }
  return output;
}

function escapeMdxText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/\\/g, '&#92;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/#/g, '&#35;')
    .replace(/\*/g, '&#42;')
    .replace(/_/g, '&#95;')
    .replace(/~/g, '&#126;')
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/`/g, '&#96;')
    .replace(/\|/g, '&#124;')
    .replace(/\b(?:javascript|data|vbscript):/gi, match => `${match.slice(0, -1)}&#58;`);
}

function inlineCode(value: string): string {
  return `\`${escapeMdxText(value)}\``;
}

function releaseSlug(releaseId: string): string {
  return releaseId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function changelogDatePrefix(date: string): string {
  const [year, month, day] = date.split('-');
  return `${month}-${day}-${year?.slice(2)}`;
}

function renderPackageTable(input: ChangelogCollection): string {
  const rows = input.packages.map(releasePackage => {
    const ecosystem = releasePackage.ecosystem === 'typescript' ? 'TypeScript' : 'Python';
    return `| ${ecosystem} ${inlineCode(releasePackage.name)} | ${inlineCode(releasePackage.version)} |`;
  });
  return ['### SDK Versions', '', '| SDK | Released version |', '| --- | --- |', ...rows].join(
    '\n'
  );
}

function renderSection(section: ChangelogOutput['sections'][number]): string {
  const lines = [`### ${SECTION_HEADINGS[section.kind]}`, ''];
  if (section.kind !== 'breaking_changes') {
    lines.push(...section.claims.map(claim => `- ${escapeMdxText(claim.text)}`));
    return lines.join('\n');
  }

  for (const [index, claim] of section.claims.entries()) {
    if (index > 0) lines.push('');
    lines.push(
      '<Callout type="warn">',
      '**Breaking Change**',
      '',
      escapeMdxText(claim.text),
      '',
      `**Migration:** ${escapeMdxText(claim.migration)}`,
      '</Callout>'
    );
  }
  return lines.join('\n');
}

export interface RenderedChangelog {
  draft_path: string;
  final_path: string;
  mdx: string;
  sha256: string;
}

export function renderChangelog(
  rawInput: ChangelogCollection,
  rawOutput: ChangelogOutput
): RenderedChangelog {
  const input = ChangelogCollectionSchema.parse(rawInput);
  const output = validateChangelogOutput(rawOutput, input);
  const orderedSections = [...output.sections].sort(
    (left, right) => SECTION_ORDER.indexOf(left.kind) - SECTION_ORDER.indexOf(right.kind)
  );
  const title = `SDK Release ${input.release_id}`;
  const mdx = [
    '---',
    `title: "${title}"`,
    `date: "${input.date}"`,
    '---',
    '',
    escapeMdxText(output.summary.text),
    '',
    renderPackageTable(input),
    ...orderedSections.flatMap(section => ['', renderSection(section)]),
    '',
  ].join('\n');
  const slug = releaseSlug(input.release_id);

  return {
    draft_path: `.github/sdk-release/drafts/${input.release_id}.mdx`,
    final_path: `docs/content/changelog/${changelogDatePrefix(input.date)}-${slug}.mdx`,
    mdx,
    sha256: sha256(mdx),
  };
}
