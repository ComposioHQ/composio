import { readFile } from 'node:fs/promises';
import { join } from 'path';
import { createOpenAPI } from 'fumadocs-openapi/server';
import { declareOperationTags, type OpenAPIDocument } from './openapi-tags';

export { declareOperationTags } from './openapi-tags';

const openapiPath = join(process.cwd(), 'public/openapi.json');
const openapiWebhooksPath = join(
  process.cwd(),
  'public/openapi-webhooks.json',
);
const openapiV3Path = join(process.cwd(), 'public/openapi-v3.json');

// v3.1 (latest) — clean operationIds, default API reference.
// The webhook-events spec (openapi-webhooks.json) is a separate OpenAPI 3.1
// document whose top-level `webhooks` block documents the payloads Composio
// delivers to customer webhook URLs; it renders under the "Webhook Events" tag.
export const openapi = createOpenAPI({
  input: {
    [openapiPath]: () => loadOpenAPISchema(openapiPath),
    [openapiWebhooksPath]: () => loadOpenAPISchema(openapiWebhooksPath),
  },
  proxyUrl: '/api/proxy',
});

// v3.0 — mounted under api-reference/v3/
export const openapiV3 = createOpenAPI({
  input: {
    [openapiV3Path]: () => loadOpenAPISchema(openapiV3Path),
  },
  proxyUrl: '/api/proxy',
});

async function loadOpenAPISchema(path: string) {
  const document = JSON.parse(await readFile(path, 'utf8')) as OpenAPIDocument;
  return declareOperationTags(normalizeNoAuthSecurity(document));
}

export function normalizeNoAuthSecurity<T extends OpenAPIDocument>(document: T): T {
  // The backend generator uses `{ no_auth: [] }` as a legacy sentinel for
  // public operations. It is not a declared security scheme, so remove that
  // alternative while preserving any declared schemes.
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(pathItem)) {
      if (!operation?.security) continue;
      operation.security = operation.security.filter(
        (requirement) => !('no_auth' in requirement),
      );
    }
  }

  return document;
}
