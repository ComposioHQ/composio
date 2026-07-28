import { join } from 'path';
import { createOpenAPI } from 'fumadocs-openapi/server';

// v3.1 (latest) — clean operationIds, default API reference.
// The webhook-events spec (openapi-webhooks.json) is a separate OpenAPI 3.1
// document whose top-level `webhooks` block documents the payloads Composio
// delivers to customer webhook URLs; it renders under the "Webhook Events" tag.
export const openapi = createOpenAPI({
  input: [
    join(process.cwd(), 'public/openapi.json'),
    join(process.cwd(), 'public/openapi-webhooks.json'),
  ],
  proxyUrl: '/api/proxy',
});

// v3.0 — mounted under api-reference/v3/
export const openapiV3 = createOpenAPI({
  input: [join(process.cwd(), 'public/openapi-v3.json')],
  proxyUrl: '/api/proxy',
});
