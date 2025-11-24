/**
 * Extracts the item type from a paginated response.
 */
type ExtractItemType<T> = T extends { items: Array<infer R> } ? R : never;

/**
 * Extracts the parameter type from a function signature.
 */
type ExtractParamsType<T> = T extends (params: infer P) => unknown ? P : never;

/**
 * Extracts the base parameters type, excluding cursor and limit.
 */
type ExtractBaseParams<T> = T extends null | undefined
  ? never
  : T extends { cursor?: string; limit?: number | null }
    ? Omit<T, 'cursor' | 'limit'>
    : never;

/**
 * Generic, type-safe utility for loading all pages from paginated API responses.
 *
 * This utility automatically handles pagination by:
 * - Invoking the provided method with `limit: 100`
 * - Traversing all pages using the `next_cursor` field
 * - Collecting and returning all items from all pages
 *
 * Types are automatically inferred from the function signature, so you don't need to specify them manually.
 *
 * @param fetchFn - A function that accepts parameters and returns a Promise of a paginated response
 * @param baseParams - Base parameters to pass to the fetch function (excluding `cursor` and `limit` which are handled automatically)
 * @returns A Promise that resolves to an array of all items from all pages
 *
 * @example
 * ```typescript
 * import { getAllPages } from './utils/pagination';
 *
 * // Fetch all tools - types are automatically inferred!
 * const allTools = await getAllPages(
 *   (params) => client.tools.list(params),
 *   { tool_slugs: 'tool1,tool2' }
 * );
 * ```
 */
export async function getAllPages<
  TFn extends (
    params: Record<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<{ items: Array<any>; next_cursor?: string | null }>,
>(
  fetchFn: TFn,
  baseParams?: Omit<ExtractBaseParams<ExtractParamsType<TFn>>, 'limit'>
): Promise<Array<ExtractItemType<Awaited<ReturnType<TFn>>>>> {
  type ItemType = ExtractItemType<Awaited<ReturnType<TFn>>>;
  type ParamsType = ExtractParamsType<TFn>;

  const allItems: Array<ItemType> = [];
  let cursor: string | null | undefined = undefined;

  const MAX_LIMIT_ALLOWED_BY_API = 100;

  while (true) {
    const params = {
      ...baseParams,
      ...(cursor !== undefined && { cursor }),
      limit: MAX_LIMIT_ALLOWED_BY_API,
    } as ParamsType;

    const response = await fetchFn(params);
    allItems.push(...response.items);

    // Stop if there's no next cursor
    if (!response.next_cursor) {
      break;
    }

    cursor = response.next_cursor;
  }

  return allItems;
}
