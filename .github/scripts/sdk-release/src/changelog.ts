import { FileSystem, HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform'
import { Config, Data, Effect, Redacted, Schema } from 'effect'
import { dirname, resolve } from 'node:path'
import { draftPath, sha256 } from './shared.ts'

/**
 * Pinned model snapshot. Moving to a newer snapshot must happen through a
 * reviewed change to this constant, never through registry alias drift.
 */
export const OPENAI_MODEL = 'gpt-5.5-2026-04-23'

export interface ReleaseFacts {
  readonly date: string
  readonly typescript: ReadonlyArray<{
    readonly name: string
    readonly version: string
    readonly summaries: ReadonlyArray<string>
  }>
  readonly python: { readonly name: string; readonly version: string } | null
}

export class ChangelogError extends Data.TaggedError('ChangelogError')<{ readonly reason: string }> {
  override get message() {
    return this.reason
  }
}

const DraftContent = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  sections: Schema.Array(Schema.Struct({ heading: Schema.String, body: Schema.String })),
})

const draftJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'sections'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'body'],
        properties: { heading: { type: 'string' }, body: { type: 'string' } },
      },
    },
  },
}

const OpenAiResponse = Schema.Struct({
  status: Schema.String,
  error: Schema.optional(Schema.NullOr(Schema.Struct({ message: Schema.String }))),
  output: Schema.optionalWith(
    Schema.Array(
      Schema.Struct({
        type: Schema.String,
        content: Schema.optional(
          Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.optional(Schema.String) }))
        ),
      })
    ),
    { default: () => [] }
  ),
})

const callModel = (factsJson: string, instructions: string) =>
  Effect.gen(function* () {
    const apiKey = yield* Config.redacted('OPENAI_API_KEY')
    const baseUrl = yield* Config.string('OPENAI_BASE_URL').pipe(Config.withDefault('https://api.openai.com/v1'))
    const client = yield* HttpClient.HttpClient
    const request = yield* HttpClientRequest.post(`${baseUrl}/responses`).pipe(
      HttpClientRequest.setHeader('authorization', `Bearer ${Redacted.value(apiKey)}`),
      HttpClientRequest.bodyJson({
        model: OPENAI_MODEL,
        instructions,
        input: factsJson,
        text: { format: { type: 'json_schema', name: 'changelog_draft', strict: true, schema: draftJsonSchema } },
        reasoning: { effort: 'low' },
        max_output_tokens: 4000,
      })
    )
    const response = yield* client.execute(request)
    if (response.status !== 200) {
      const body = yield* response.text
      return yield* new ChangelogError({ reason: `OpenAI responded ${response.status}: ${body.slice(0, 500)}` })
    }
    const parsed = yield* HttpClientResponse.schemaBodyJson(OpenAiResponse)(response)
    if (parsed.status !== 'completed') {
      return yield* new ChangelogError({
        reason: `OpenAI response status "${parsed.status}"${parsed.error ? `: ${parsed.error.message}` : ''}`,
      })
    }
    const content = parsed.output.find((item) => item.type === 'message')?.content ?? []
    if (content.some((part) => part.type === 'refusal')) {
      return yield* new ChangelogError({ reason: 'The model refused to draft the changelog.' })
    }
    const text = content.find((part) => part.type === 'output_text')?.text
    if (text === undefined) {
      return yield* new ChangelogError({ reason: 'OpenAI response contained no output text.' })
    }
    return yield* Schema.decodeUnknown(Schema.parseJson(DraftContent))(text)
  }).pipe(Effect.scoped, Effect.timeout('120 seconds'))

/** Escape MDX-active characters in model output, leaving inline code spans untouched. */
const escapeMdx = (text: string) =>
  text
    .split('`')
    .map((part, index) => (index % 2 === 0 ? part.replace(/[{}<]/g, (char) => `\\${char}`) : part))
    .join('`')

/** Deterministic rendering: the model provides prose; code owns frontmatter, structure, and versions. */
export const renderDraft = (facts: ReleaseFacts, content: typeof DraftContent.Type, inputHash: string) =>
  [
    '---',
    `title: ${JSON.stringify(content.title)}`,
    `description: ${JSON.stringify(content.description)}`,
    `date: "${facts.date}"`,
    '---',
    '',
    `{/* sdk-release input-hash ${inputHash} */}`,
    '',
    ...content.sections.flatMap((section) => [`## ${escapeMdx(section.heading)}`, '', escapeMdx(section.body), '']),
    '## Released versions',
    '',
    ...facts.typescript.map((pkg) => `- \`${pkg.name}@${pkg.version}\` (npm)`),
    ...(facts.python === null ? [] : [`- \`${facts.python.name}==${facts.python.version}\` (PyPI)`]),
    '',
  ].join('\n')

export const generateDraft = (facts: ReleaseFacts) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const factsJson = JSON.stringify(facts, null, 2)
    const inputHash = sha256(factsJson)
    const existing = yield* fs.readFileString(draftPath).pipe(Effect.option)
    if (existing._tag === 'Some' && existing.value.includes(inputHash)) {
      return yield* Effect.log('Draft already matches these release facts; keeping it (it may carry human edits).')
    }
    const prompt = yield* fs.readFileString(resolve(import.meta.dir, '../prompt.md'))
    const content = yield* callModel(factsJson, prompt)
    yield* fs.makeDirectory(dirname(draftPath), { recursive: true })
    yield* fs.writeFileString(draftPath, renderDraft(facts, content, inputHash))
    yield* Effect.log(`Wrote changelog draft to ${draftPath}`)
  })
