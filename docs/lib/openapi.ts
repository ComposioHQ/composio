import { readFile } from 'node:fs/promises';
import { join } from 'path';
import { createOpenAPI } from 'fumadocs-openapi/server';

const openapiPath = join(process.cwd(), 'public/openapi.json');
const openapiV3Path = join(process.cwd(), 'public/openapi-v3.json');

// v3.1 (latest) — clean operationIds, default API reference
export const openapi = createOpenAPI({
  input: {
    [openapiPath]: () => loadOpenAPISchema(openapiPath),
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
  const document = JSON.parse(await readFile(path, 'utf8')) as {
    paths?: Record<
      string,
      Record<string, { security?: Record<string, string[]>[] } | undefined>
    >;
  };

  // The backend generator uses `{ no_auth: [] }` as a legacy sentinel for
  // public operations. It is not a declared security scheme, so normalize it
  // to the OpenAPI-standard empty security requirement before Fumadocs loads it.
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(pathItem)) {
      if (
        operation?.security?.some((requirement) => 'no_auth' in requirement)
      ) {
        operation.security = [];
      }
    }
  }

  return document;
}
