import { LanguageModel } from '@effect/ai';
import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai';
import { FetchHttpClient, FileSystem } from '@effect/platform';
import { Config, Data, Effect, Layer, Option, Schema } from 'effect';
import { dirname, resolve } from 'node:path';
import { draftPath, exec, sha256 } from './shared.ts';

/**
 * Pinned model snapshot. Moving to a newer snapshot must happen through a
 * reviewed change to this constant, never through registry alias drift.
 */
export const OPENAI_MODEL = 'gpt-5.5-2026-04-23';

export interface ReleaseFacts {
  readonly date: string;
  readonly typescript: ReadonlyArray<{
    readonly name: string;
    readonly version: string;
    readonly summaries: ReadonlyArray<string>;
  }>;
  readonly python: { readonly name: string; readonly version: string } | null;
}

export class ChangelogError extends Data.TaggedError('ChangelogError')<{
  readonly reason: string;
}> {
  override get message() {
    return this.reason;
  }
}

const DraftContent = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  sections: Schema.Array(Schema.Struct({ heading: Schema.String, body: Schema.String })),
});

// Self-contained OpenAI layer: only the changelog command needs it, so the
// API key is required here, not at CLI startup for every subcommand.
const OpenAi = OpenAiClient.layerConfig({
  apiKey: Config.redacted('OPENAI_API_KEY'),
  apiUrl: Config.string('OPENAI_BASE_URL').pipe(Config.withDefault(undefined)),
}).pipe(Layer.provide(FetchHttpClient.layer));

/**
 * Fail fast with a clear, actionable error when OPENAI_API_KEY is missing,
 * instead of letting the OpenAI client layer surface whatever opaque
 * config-resolution error it produces deep inside the model call. Only checks
 * that the key is present — `Config.option` never exposes the value itself,
 * so nothing here can leak the secret into logs.
 */
export const requireOpenAiKey = Config.option(Config.redacted('OPENAI_API_KEY')).pipe(
  Effect.flatMap(key =>
    Option.isSome(key)
      ? Effect.void
      : Effect.fail(
          new ChangelogError({
            reason:
              'OPENAI_API_KEY is not set. Set the secret and re-run, or write the changelog draft by hand at ' +
              '.github/sdk-release/draft.mdx so the release PR is not blocked on it.',
          })
        )
  )
);

const callModel = (factsJson: string, instructions: string) =>
  requireOpenAiKey.pipe(
    Effect.zipRight(
      LanguageModel.generateObject({
        prompt: [
          { role: 'system', content: instructions },
          { role: 'user', content: factsJson },
        ],
        schema: DraftContent,
        objectName: 'changelog_draft',
      }).pipe(
        Effect.map(response => response.value),
        Effect.provide(
          OpenAiLanguageModel.model(OPENAI_MODEL, {
            reasoning: { effort: 'low' },
            max_output_tokens: 4000,
            strict: true,
          })
        ),
        Effect.provide(OpenAi),
        // timeout must be applied before mapError, so a slow call's
        // TimeoutException still gets wrapped into ChangelogError — mapError
        // only catches errors from what it wraps, and pipe order is
        // outer-to-inner in the order written.
        Effect.timeout('120 seconds'),
        Effect.mapError(
          error => new ChangelogError({ reason: `changelog generation failed: ${error}` })
        )
      )
    )
  );

/** Escape MDX-active characters in model output, leaving inline code spans untouched. */
const escapeMdx = (text: string) =>
  text
    .split('`')
    .map((part, index) => (index % 2 === 0 ? part.replace(/[{}<]/g, char => `\\${char}`) : part))
    .join('`');

/** Deterministic rendering: the model provides prose; code owns frontmatter, structure, and versions. */
export const renderDraft = (
  facts: ReleaseFacts,
  content: typeof DraftContent.Type,
  inputHash: string
) =>
  [
    '---',
    `title: ${JSON.stringify(content.title)}`,
    `description: ${JSON.stringify(content.description)}`,
    `date: "${facts.date}"`,
    '---',
    '',
    `{/* sdk-release input-hash ${inputHash} */}`,
    '',
    ...content.sections.flatMap(section => [
      `### ${escapeMdx(section.heading)}`,
      '',
      escapeMdx(section.body),
      '',
    ]),
    // The row format below is a repo invariant: test/release-workflow.test.ts
    // requires every current SDK version to be documented as such a table row.
    '### SDK versions',
    '',
    '| SDK | Version |',
    '| --- | --- |',
    ...facts.typescript.map(pkg => `| TypeScript \`${pkg.name}\` | \`${pkg.version}\` |`),
    ...(facts.python === null
      ? []
      : [`| Python \`${facts.python.name}\` | \`${facts.python.version}\` |`]),
    '',
  ].join('\n');

/**
 * Hash of the release identity only — the packages, versions, and changeset
 * summaries being shipped. `facts.date` is deliberately excluded: it changes on
 * a UTC day rollover (a re-run, or another push to the release PR) for the very
 * same release, and hashing it would regenerate the draft and silently discard
 * human edits made during review.
 */
export const releaseInputHash = (facts: ReleaseFacts) =>
  sha256(JSON.stringify({ typescript: facts.typescript, python: facts.python }));

export const generateDraft = (facts: ReleaseFacts) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const factsJson = JSON.stringify(facts, null, 2);
    const inputHash = releaseInputHash(facts);
    // Prefer an existing draft for identical facts — the working tree first, then
    // the open release-PR branch (changesets/action rebuilds it from next each
    // push, and regenerating would discard human edits made in the PR).
    const existing = yield* fs.readFileString(draftPath).pipe(
      Effect.orElse(() =>
        exec('git', 'show', 'origin/changeset-release/next:.github/sdk-release/draft.mdx')
      ),
      Effect.option
    );
    if (Option.isSome(existing) && existing.value.includes(inputHash)) {
      yield* fs.makeDirectory(dirname(draftPath), { recursive: true });
      yield* fs.writeFileString(draftPath, existing.value);
      return yield* Effect.log(
        'Reusing existing draft for identical release facts (it may carry human edits).'
      );
    }
    const prompt = yield* fs.readFileString(resolve(import.meta.dir, '../prompt.md'));
    const content = yield* callModel(factsJson, prompt);
    yield* fs.makeDirectory(dirname(draftPath), { recursive: true });
    yield* fs.writeFileString(draftPath, renderDraft(facts, content, inputHash));
    yield* Effect.log(`Wrote changelog draft to ${draftPath}`);
  });
