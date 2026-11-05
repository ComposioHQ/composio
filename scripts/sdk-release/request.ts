import { Schema } from 'effect';
import { autoByDefault } from './plan';

/** Per-language bump choices; `auto` follows the changesets. */
export const ReleaseRequest = Schema.Struct({ typescript: autoByDefault, python: autoByDefault });
export type ReleaseRequest = typeof ReleaseRequest.Type;

const Dispatch = Schema.Struct({
  inputs: Schema.Record(Schema.String, Schema.Unknown),
});
const Issue = Schema.Struct({ issue: Schema.Struct({ body: Schema.String }) });

/** Issue-form headings and the request fields they fill. */
const ISSUE_FIELDS = { TypeScript: 'typescript', Python: 'python' } as const;
const ISSUE_FIELD_PATTERN = /^### (TypeScript|Python)\r?\n\r?\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm;

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

/** Reads the same request from a workflow dispatch or from the issue form. */
export function parseReleaseRequest(eventName: string, payload: unknown): ReleaseRequest {
  const fields =
    eventName === 'workflow_dispatch'
      ? Schema.decodeUnknownSync(Dispatch)(payload).inputs
      : eventName === 'issues'
        ? parseIssueBody(Schema.decodeUnknownSync(Issue)(payload).issue.body)
        : undefined;
  if (!fields) throw new Error('Unsupported SDK release request event');
  return Schema.decodeUnknownSync(ReleaseRequest)(fields);
}
