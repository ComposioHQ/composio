import { join } from 'path';
import { createOpenAPI } from 'fumadocs-openapi/server';

// v3.1 (latest) — clean operationIds, default API reference
export const openapi = createOpenAPI({
  input: [join(process.cwd(), 'public/openapi.json')],
  proxyUrl: '/api/proxy',
});

// v3.0 — mounted under api-reference/v3/
export const openapiV3 = createOpenAPI({
  input: [join(process.cwd(), 'public/openapi-v3.json')],
  proxyUrl: '/api/proxy',
});
