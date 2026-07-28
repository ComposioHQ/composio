import type { ReactNode } from 'react';
import type { Item } from 'fumadocs-core/page-tree';
import { DeprecatedApiSidebarLegacyBadge } from '@/components/legacy-badge';
import { getApiDisplayTitle, isApiPageDeprecated } from '@/lib/api-deprecation';
import type { ApiPageOperation, OpenApiSchemaPageData } from '@/lib/api-deprecation';

interface OpenApiSidebarPageData extends OpenApiSchemaPageData {
  title: string;
  getOpenAPIPageProps: () => {
    operations?: ApiPageOperation[];
  };
}

function isOpenApiSidebarPageData(data: unknown): data is OpenApiSidebarPageData {
  if (!data || typeof data !== 'object') return false;

  const candidate = data as Partial<OpenApiSidebarPageData>;
  return (
    typeof candidate.title === 'string' &&
    typeof candidate.getSchema === 'function' &&
    typeof candidate.getOpenAPIPageProps === 'function'
  );
}

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
interface PageStorage {
  read(path: string): { format: string; data: unknown } | undefined;
}

export function transformDeprecatedApiSidebarNode(
  node: Item,
  filePath: string | undefined,
  storage: PageStorage
): Item {
  if (!filePath) return node;

  const file = storage.read(filePath);
  if (!file || file.format !== 'page' || !isOpenApiSidebarPageData(file.data)) {
    return node;
  }

  const apiProps = file.data.getOpenAPIPageProps();
  return {
    ...node,
    name: getDeprecatedApiSidebarName(file.data.title, file.data, apiProps.operations),
  };
}
