import { z } from 'zod';
import { releaseChoiceSchema } from './plan';

const runIdSchema = z.string().regex(/^[1-9][0-9]*$/);
export const releaseRequestSchema = z
  .object({
    action: z.enum(['release', 'refresh', 'status', 'retry']).default('release'),
    typescript: releaseChoiceSchema.default('auto'),
    python: releaseChoiceSchema.default('auto'),
    run_id: runIdSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.action === 'retry' && !value.run_id)
      context.addIssue({
        code: 'custom',
        path: ['run_id'],
        message: 'Retry requires the original run ID',
      });
  });
export type ReleaseRequest = z.infer<typeof releaseRequestSchema>;
const dispatchSchema = z.object({ inputs: z.record(z.string(), z.unknown()).default({}) });
const issueSchema = z.object({ issue: z.object({ body: z.string() }) });

export function parseReleaseRequest(eventName: string, payload: unknown): ReleaseRequest {
  if (eventName === 'workflow_dispatch') {
    const { inputs } = dispatchSchema.parse(payload);
    return releaseRequestSchema.parse({
      ...inputs,
      run_id: inputs.run_id === '' ? undefined : inputs.run_id,
    });
  }
  if (eventName !== 'issues') throw new Error('Unsupported SDK release request event');
  const body = issueSchema.parse(payload).issue.body;
  const fields = new Map<string, string>();
  for (const match of body.matchAll(
    /^### (Action|TypeScript|Python|Original run ID)\r?\n\r?\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm
  )) {
    if (fields.has(match[1])) throw new Error(`Duplicate release field: ${match[1]}`);
    fields.set(match[1], match[2].trim());
  }
  if (!fields.has('Action') || !fields.has('TypeScript') || !fields.has('Python'))
    throw new Error('Use the SDK release request issue form');
  const original = fields.get('Original run ID');
  return releaseRequestSchema.parse({
    action: fields.get('Action'),
    typescript: fields.get('TypeScript'),
    python: fields.get('Python'),
    run_id: !original || original === '_No response_' ? undefined : original,
  });
}
