import { z } from 'zod';

/**
 * The `endpoints={[...]}` prop of `<ApiEndpointsTable />`.
 *
 * `scripts/generate-api-index.ts` serializes this array into MDX as a JSON
 * string, so every reader — the React component, the `.md` converter in
 * `lib/source.ts`, and the route guard in
 * `tests/static/api-reference-routes.test.ts` — is reading external data and
 * parses it here once, with `z.infer` flowing downstream.
 *
 * Deliberately non-strict: unknown keys are stripped rather than rejected, so
 * adding a field to the generator does not break rendering on pages generated
 * before the field existed.
 */
export const apiEndpointSchema = z.object({
  method: z.string(),
  /** Path under the current prefix, e.g. `/api/v3.1/tools/{tool_slug}`. */
  pathV31: z.string(),
  /** Same operation under the previous prefix, e.g. `/api/v3/tools/{tool_slug}`. */
  pathV3: z.string(),
  summary: z.string(),
  href: z.string(),
  /**
   * Set by the generator for operations flagged `deprecated` in the OpenAPI
   * spec. Surfaced with the existing "Legacy" tag (see
   * `components/legacy-badge.tsx`).
   */
  legacy: z.boolean().optional(),
});

export const apiEndpointsSchema = z.array(apiEndpointSchema);

export type ApiEndpoint = z.infer<typeof apiEndpointSchema>;
