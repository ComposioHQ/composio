import assert from 'node:assert/strict';
import { z } from 'zod';

const batchSchema = z.object({
  results: z.array(
    z.object({
      error: z.string().nullish(),
      response: z.object({ successful: z.boolean(), error: z.string().nullish() }).nullish(),
    })
  ),
  total_count: z.number(),
  success_count: z.number(),
  error_count: z.number(),
});
// Session execution returns the tool data; MCP returns the tool's response wrapper.
const batchResponseSchema = z.union([
  batchSchema,
  z.object({ data: batchSchema }).transform(wrapper => wrapper.data),
]);

export function assertBatch(data: unknown, successes: number, failures: number) {
  const batch = batchResponseSchema.parse(data);
  assert.equal(batch.total_count, successes + failures);
  assert.equal(batch.results.length, successes + failures);
  assert.equal(batch.success_count, successes);
  assert.equal(batch.error_count, failures);
  let denied = 0;
  for (const result of batch.results) {
    const error = result.error ?? result.response?.error;
    if (error) {
      assertDenied(error);
      denied++;
    } else {
      assert.ok(result.response?.successful, 'Tool did not succeed and has no approval denial');
    }
  }
  assert.equal(denied, failures);
}

export function assertDenied(error: unknown) {
  assert.match(JSON.stringify(error), /approv|deni|declin|cancel|reject/i);
}
