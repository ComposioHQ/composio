import type { ReactNode } from 'react';
import type { Item } from 'fumadocs-core/page-tree';
import type { PageTreeTransformer } from 'fumadocs-core/source';
import { DeprecatedApiSidebarLegacyBadge } from '@/components/legacy-badge';
import { getApiDisplayTitle, isApiPageDeprecated } from '@/lib/api-deprecation';
import type { ApiPageOperation, OpenApiSchemaPageData } from '@/lib/api-deprecation';

interface OpenApiSidebarPageData extends OpenApiSchemaPageData {
  title: string;
  getAPIPageProps: () => {
    operations?: ApiPageOperation[];
  };
}

function isOpenApiSidebarPageData(data: unknown): data is OpenApiSidebarPageData {
  if (!data || typeof data !== 'object') return false;

  const candidate = data as Partial<OpenApiSidebarPageData>;
  return (
    typeof candidate.title === 'string' &&
    typeof candidate.getSchema === 'function' &&
    typeof candidate.getAPIPageProps === 'function'
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
export const deprecatedApiSidebarTransformer: PageTreeTransformer = {
  file(node: Item, filePath?: string): Item {
    if (!filePath) return node;

    const file = this.storage.read(filePath);
    if (!file || file.format !== 'page' || !isOpenApiSidebarPageData(file.data)) {
      return node;
    }

    const apiProps = file.data.getAPIPageProps();
    return {
      ...node,
      name: getDeprecatedApiSidebarName(file.data.title, file.data, apiProps.operations),
    };
  },
};
