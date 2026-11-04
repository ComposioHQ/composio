import { Effect, Schema } from 'effect';
import { RunId } from './github';
import { autoByDefault } from './plan';

export const ReleaseRequest = Schema.Struct({
  action: Schema.Literals(['release', 'refresh', 'status', 'retry']).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('release' as const))
  ),
  typescript: autoByDefault,
  python: autoByDefault,
  run_id: Schema.optionalKey(RunId),
}).check(
  Schema.makeFilter(value =>
    value.action !== 'retry' || value.run_id !== undefined
      ? undefined
      : { path: ['run_id'], issue: 'Retry requires the original run ID' }
  )
);
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
  Action: 'action',
  TypeScript: 'typescript',
  Python: 'python',
  'Original run ID': 'run_id',
} as const;
const REQUIRED_ISSUE_FIELDS = ['Action', 'TypeScript', 'Python'] as const;
const ISSUE_FIELD_PATTERN =
  /^### (Action|TypeScript|Python|Original run ID)\r?\n\r?\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm;
const parseIssueBody = (body: string) => {
  const fields = new Map<keyof typeof ISSUE_FIELDS, string>();
  for (const match of body.matchAll(ISSUE_FIELD_PATTERN)) {
    const heading = match[1] as keyof typeof ISSUE_FIELDS;
    if (fields.has(heading)) throw new Error(`Duplicate release field: ${heading}`);
    fields.set(heading, match[2].trim());
  }
  if (!REQUIRED_ISSUE_FIELDS.every(heading => fields.has(heading)))
    throw new Error('Use the SDK release request issue form');
  return Object.fromEntries([...fields].map(([heading, value]) => [ISSUE_FIELDS[heading], value]));
};

interface RequestSource {
  readonly fields: (payload: unknown) => Record<string, unknown>;
  /** Values a source uses for an omitted original run ID. */
  readonly emptyRunIds: ReadonlySet<unknown>;
}

const REQUEST_SOURCES: Record<string, RequestSource> = {
  workflow_dispatch: {
    fields: payload => Schema.decodeUnknownSync(Dispatch)(payload).inputs,
    emptyRunIds: new Set([undefined, '']),
  },
  issues: {
    fields: payload => parseIssueBody(Schema.decodeUnknownSync(Issue)(payload).issue.body),
    emptyRunIds: new Set([undefined, '', '_No response_']),
  },
};

/** Normalizes an issue-form or dispatch request through one schema. */
export function parseReleaseRequest(eventName: string, payload: unknown): ReleaseRequest {
  const source = REQUEST_SOURCES[eventName];
  if (!source) throw new Error('Unsupported SDK release request event');
  const { run_id, ...fields } = source.fields(payload);
  return decodeRequest(source.emptyRunIds.has(run_id) ? fields : { ...fields, run_id });
}
