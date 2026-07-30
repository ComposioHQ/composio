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

const callModel = (factsJson: string, instructions: string) =>
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
    Effect.mapError(
      error => new ChangelogError({ reason: `changelog generation failed: ${error}` })
    ),
    Effect.timeout('120 seconds')
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
      `## ${escapeMdx(section.heading)}`,
      '',
      escapeMdx(section.body),
      '',
    ]),
    // The row format below is a repo invariant: test/release-workflow.test.ts
    // requires every current SDK version to be documented as such a table row.
    '## Released versions',
    '',
    '| SDK | Version |',
    '| --- | --- |',
    ...facts.typescript.map(pkg => `| TypeScript \`${pkg.name}\` | \`${pkg.version}\` |`),
    ...(facts.python === null
      ? []
      : [`| Python \`${facts.python.name}\` | \`${facts.python.version}\` |`]),
    '',
  ].join('\n');

export const generateDraft = (facts: ReleaseFacts) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const factsJson = JSON.stringify(facts, null, 2);
    const inputHash = sha256(factsJson);
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
