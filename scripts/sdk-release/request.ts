import { Effect, Schema } from 'effect';
import { autoByDefault } from './plan';

export const ReleaseRequest = Schema.Struct({
  typescript: autoByDefault,
  python: autoByDefault,
  /** Plan past the newest tagged release when some of its versions never reached the registry. */
  supersede: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
});
export type ReleaseRequest = typeof ReleaseRequest.Type;
const decodeRequest = Schema.decodeUnknownSync(ReleaseRequest);

const Dispatch = Schema.Struct({
  inputs: Schema.Record(Schema.String, Schema.Unknown).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({}))
  ),
});
const Issue = Schema.Struct({ issue: Schema.Struct({ body: Schema.String }) });

/** Issue-form headings and the request fields they fill. */
const ISSUE_FIELDS = {
  TypeScript: 'typescript',
  Python: 'python',
  'Supersede a stranded release': 'supersede',
} as const;
const ISSUE_FIELD_PATTERN =
  /^### (TypeScript|Python|Supersede a stranded release)\r?\n\r?\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm;
const parseIssueBody = (body: string) => {
  const fields = new Map<keyof typeof ISSUE_FIELDS, string>();
  for (const match of body.matchAll(ISSUE_FIELD_PATTERN)) {
    const heading = match[1] as keyof typeof ISSUE_FIELDS;
    if (fields.has(heading)) throw new Error(`Duplicate release field: ${heading}`);
    fields.set(heading, match[2].trim());
  }
  if (fields.size !== Object.keys(ISSUE_FIELDS).length)
    throw new Error('Use the SDK release request issue form');
  return Object.fromEntries([...fields].map(([heading, value]) => [ISSUE_FIELDS[heading], value]));
};

const REQUEST_SOURCES: Record<string, (payload: unknown) => Record<string, unknown>> = {
  workflow_dispatch: payload => Schema.decodeUnknownSync(Dispatch)(payload).inputs,
  issues: payload => parseIssueBody(Schema.decodeUnknownSync(Issue)(payload).issue.body),
};

/** Dispatch sends a boolean or its string form; the issue form sends yes or no. */
const SUPERSEDE_VALUES = new Map<unknown, boolean>([
  [true, true],
  ['true', true],
  ['yes', true],
  [false, false],
  ['false', false],
  ['no', false],
]);

export function parseReleaseRequest(eventName: string, payload: unknown): ReleaseRequest {
  const source = REQUEST_SOURCES[eventName];
  if (!source) throw new Error('Unsupported SDK release request event');
  const { supersede, ...fields } = source(payload);
  return decodeRequest(
    supersede === undefined
      ? fields
      : { ...fields, supersede: SUPERSEDE_VALUES.get(supersede) ?? supersede }
  );
}
