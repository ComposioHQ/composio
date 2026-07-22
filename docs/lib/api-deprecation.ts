interface ApiPageOperation {
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
