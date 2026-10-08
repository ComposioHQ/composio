import type { ReactNode } from 'react';
import type { Item } from 'fumadocs-core/page-tree';
import type { ContentStorage } from 'fumadocs-core/source';
import { z } from 'zod';
import { DeprecatedApiSidebarLegacyBadge } from '@/components/legacy-badge';
import { getApiDisplayTitle, isApiPageDeprecated } from '@/lib/api-deprecation';
import type { ApiPageOperation, OpenApiSchemaPageData } from '@/lib/api-deprecation';

// Page data attached by fumadocs-openapi to generated operation pages. MDX
// pages in the same tree lack these members, so the data is parsed once here
// and non-OpenAPI pages simply fail the parse.
const openApiSidebarPageDataSchema = z.object({
  title: z.string(),
  getSchema: z.custom<OpenApiSchemaPageData['getSchema']>(value => typeof value === 'function'),
  getOpenAPIPageProps: z.custom<() => { operations?: ApiPageOperation[] }>(
    value => typeof value === 'function'
  ),
});

export function getDeprecatedApiSidebarName(
  title: string,
  pageData: OpenApiSchemaPageData,
  operations?: ApiPageOperation[]
): ReactNode {
  if (!isApiPageDeprecated(pageData, operations)) return title;

  return (
    <span className="min-w-0">
      {getApiDisplayTitle(title, true)} <DeprecatedApiSidebarLegacyBadge />
    </span>
  );
}

/**
 * Replaces a deprecated OpenAPI operation's textual title suffix with a
 * compact lifecycle badge before fumadocs-openapi appends its method label.
 */
export function transformDeprecatedApiSidebarNode(
  node: Item,
  filePath: string | undefined,
  storage: ContentStorage
): Item {
  if (!filePath) return node;

  const file = storage.read(filePath);
  if (!file || file.format !== 'page') return node;

  const pageData = openApiSidebarPageDataSchema.safeParse(file.data);
  if (!pageData.success) return node;

  const apiProps = pageData.data.getOpenAPIPageProps();
  return {
    ...node,
    name: getDeprecatedApiSidebarName(pageData.data.title, pageData.data, apiProps.operations),
  };
}
