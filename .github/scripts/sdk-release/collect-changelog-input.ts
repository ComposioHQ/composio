import { PackageSchema } from './contracts';
import { z } from 'zod';

const MAX_SOURCE_COUNT = 64;
const MAX_COMBINED_SOURCE_CHARACTERS = 64_000;

const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, 'expected a real YYYY-MM-DD date');
const ReleaseIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const ChangesetSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    summary: z.string().min(1).max(4_000),
  })
  .strict();
const PullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string().min(1).max(256),
    body: z.string().max(8_000),
    url: z.string().url(),
    merged_at: z.string().datetime({ offset: true }),
    merge_commit_sha: z.string().regex(/^[a-f0-9]{40}$/),
  })
  .strict()
  .superRefine((pullRequest, context) => {
    const url = new URL(pullRequest.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const expectedNumber = String(pullRequest.number);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      pathParts.length !== 4 ||
      pathParts[2] !== 'pull' ||
      pathParts[3] !== expectedNumber ||
      url.search ||
      url.hash
    ) {
      context.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'expected a verified GitHub pull request URL matching its number',
      });
    }
  });

const CollectionRequestSchema = z
  .object({
    release_id: ReleaseIdSchema,
    date: DateSchema,
    packages: z.array(PackageSchema).min(1).max(256),
    changesets: z.array(ChangesetSchema).max(MAX_SOURCE_COUNT),
    pull_requests: z.array(PullRequestSchema).max(MAX_SOURCE_COUNT),
  })
  .strict();

const SourceShape = {
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(256),
  body: z.string().max(8_000),
};
export const ChangelogSourceSchema = z.discriminatedUnion('kind', [
  z.object({ ...SourceShape, kind: z.literal('changeset') }).strict(),
  z
    .object({
      ...SourceShape,
      kind: z.literal('pull_request'),
      url: z.string().url(),
      merged_at: z.string().datetime({ offset: true }),
      merge_commit_sha: z.string().regex(/^[a-f0-9]{40}$/),
    })
    .strict(),
]);

export const ChangelogCollectionSchema = z
  .object({
    schema_version: z.literal('sdk-release-changelog-input/v1'),
    release_id: ReleaseIdSchema,
    date: DateSchema,
    packages: z.array(PackageSchema).min(1).max(256),
    sources: z.array(ChangelogSourceSchema).min(1).max(MAX_SOURCE_COUNT),
  })
  .strict();

export type ChangelogCollection = z.infer<typeof ChangelogCollectionSchema>;
export type ChangelogCollectionRequest = z.input<typeof CollectionRequestSchema>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export function collectChangelogInput(request: ChangelogCollectionRequest): ChangelogCollection {
  const parsed = CollectionRequestSchema.parse(request);
  const sources = [
    ...parsed.changesets.map(changeset => ({
      id: `changeset:${changeset.id}`,
      kind: 'changeset' as const,
      title: `Changeset ${changeset.id}`,
      body: changeset.summary,
    })),
    ...parsed.pull_requests.map(pullRequest => ({
      id: `pr:${pullRequest.number}`,
      kind: 'pull_request' as const,
      title: pullRequest.title,
      body: pullRequest.body,
      url: pullRequest.url,
      merged_at: pullRequest.merged_at,
      merge_commit_sha: pullRequest.merge_commit_sha,
    })),
  ].sort((left, right) => compareText(left.id, right.id));

  if (sources.length === 0) {
    throw new Error('Changelog input requires at least one verified source');
  }
  const duplicateSource = sources.find(
    (source, index) => sources.findIndex(candidate => candidate.id === source.id) !== index
  );
  if (duplicateSource) {
    throw new Error(`Duplicate changelog source ID: ${duplicateSource.id}`);
  }
  const totalCharacters = sources.reduce(
    (total, source) =>
      total +
      source.title.length +
      source.body.length +
      (source.kind === 'pull_request' ? source.url.length : 0),
    0
  );
  if (totalCharacters > MAX_COMBINED_SOURCE_CHARACTERS) {
    throw new Error(
      `Changelog sources exceed the ${MAX_COMBINED_SOURCE_CHARACTERS}-character input limit`
    );
  }

  return ChangelogCollectionSchema.parse({
    schema_version: 'sdk-release-changelog-input/v1',
    release_id: parsed.release_id,
    date: parsed.date,
    packages: [...parsed.packages].sort(
      (left, right) =>
        compareText(left.ecosystem, right.ecosystem) || compareText(left.name, right.name)
    ),
    sources,
  });
}
