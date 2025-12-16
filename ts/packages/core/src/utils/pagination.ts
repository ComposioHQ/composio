/**
 * Pagination parameters that getAllPages will pass to the fetch function.
 */
type PaginationParams = {
  cursor?: string;
  limit: number;
};

/**
 * Extracts the item type from a paginated response.
 */
type ExtractItemType<T> = T extends { items: Array<infer R> } ? R : never;

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
 * @param fetchFn - A function that accepts pagination parameters and returns a Promise of a paginated response.
 *                   Base parameters should be captured in the function closure.
 * @returns A Promise that resolves to an array of all items from all pages
 *
 * @example
 * ```typescript
 * import { getAllPages } from './utils/pagination';
 *
 * // Fetch all tools - types are automatically inferred!
 * const allTools = await getAllPages((params) =>
 *   client.tools.list({
 *     ...params,
 *     tool_slugs: 'tool1,tool2',
 *   })
 * );
 * // allTools is inferred as Array<ToolListResponse.Item>
 * ```
 */
export async function getAllPages<
  TFn extends (
    params: PaginationParams
  ) => Promise<{ items: Array<unknown>; next_cursor?: string | null }>,
>(fetchFn: TFn): Promise<Array<ExtractItemType<Awaited<ReturnType<TFn>>>>> {
  type ResponseType = Awaited<ReturnType<TFn>>;
  type ItemType = ExtractItemType<ResponseType>;

  const allItems: Array<ItemType> = [];
  let cursor: string | null | undefined = undefined;

  const MAX_LIMIT_ALLOWED_BY_API = 100;

  while (true) {
    const params: PaginationParams = {
      ...(cursor !== undefined && { cursor }),
      limit: MAX_LIMIT_ALLOWED_BY_API,
    };

    const response = await fetchFn(params);
    allItems.push(...(response.items as Array<ItemType>));

    // Stop if there's no next cursor
    if (!response.next_cursor) {
      break;
    }

    cursor = response.next_cursor;
  }

  return allItems;
}
