export type OpenAPIOperation = {
  security?: Record<string, string[]>[];
  tags?: string[];
};

export type OpenAPIDocument = {
  tags?: { name: string }[];
  paths?: Record<string, Record<string, OpenAPIOperation | undefined>>;
  webhooks?: Record<string, Record<string, OpenAPIOperation | undefined>>;
};

/**
 * Up to fumadocs-openapi 11.3, tag grouping only generated pages for operations
 * whose tags were declared in the document's top-level `tags` array; operations
 * with undeclared tags were silently skipped. The backend generator omits some
 * tags (e.g. Projects) from that array, so declare every tag used by an
 * operation.
 *
 * 11.4 no longer drops those operations (see the guard in
 * tests/static/api-reference-routes.test.ts). This normalization is kept anyway,
 * so the committed specs stay complete at sync time and as a safety net for
 * older fumadocs-openapi behaviour.
 *
 * Applied both when syncing specs (scripts/fetch-openapi.mjs) so the committed
 * documents are complete, and again at load time (lib/openapi.ts) as a safety
 * net for snapshots that predate the sync-time normalization.
 */
export function declareOperationTags<T extends OpenAPIDocument>(document: T): T {
  const declared = new Set((document.tags ?? []).map((tag) => tag.name));
  const undeclared: string[] = [];
  for (const group of [document.paths, document.webhooks]) {
    for (const pathItem of Object.values(group ?? {})) {
      for (const operation of Object.values(pathItem ?? {})) {
        if (!operation || typeof operation !== 'object') continue;
        for (const tag of operation.tags ?? []) {
          if (declared.has(tag)) continue;
          declared.add(tag);
          undeclared.push(tag);
        }
      }
    }
  }

  if (undeclared.length > 0) {
    document.tags = [
      ...(document.tags ?? []),
      ...undeclared.map((name) => ({ name })),
    ];
  }

  return document;
}
