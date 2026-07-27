export interface ApiPageOperation {
  method: string;
  path: string;
}

export interface OpenApiSchemaPageData {
  getSchema: () => {
    dereferenced: {
      paths?: Record<
        string,
        Record<string, { deprecated?: boolean } | undefined> | undefined
      >;
    };
  };
}

/**
 * Removes the source-level deprecation suffix when a structured lifecycle
 * badge is rendered alongside the title. Other contexts keep the raw OpenAPI
 * title so they do not lose their only deprecation signal.
 */
export function getApiDisplayTitle(title: string, deprecated: boolean): string {
  if (!deprecated) return title;

  return title.replace(/\s+\(deprecated\)\s*$/i, '');
}

/**
 * Returns whether any operation rendered by an OpenAPI page is deprecated.
 * Operation detail pages currently contain one operation, but checking all of
 * them keeps the helper correct for grouped pages too.
 */
export function isApiPageDeprecated(
  pageData: OpenApiSchemaPageData,
  operations?: ApiPageOperation[],
): boolean {
  if (!operations || operations.length === 0) return false;

  const paths = pageData.getSchema().dereferenced.paths;
  return operations.some(
    ({ method, path }) => paths?.[path]?.[method]?.deprecated === true,
  );
}
