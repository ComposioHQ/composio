import type { ReactNode } from 'react';
import type { TOCItemType } from 'fumadocs-core/toc';
import type { OpenAPIPageProps } from 'fumadocs-openapi/ui';
import { z } from 'zod';
import type { OpenApiSchemaPageData } from '@/lib/api-deprecation';
import type { ReferenceMdxPageData } from '@/lib/source';

// The combined reference source mixes MDX and fumadocs-openapi pages, so page
// data is parsed once against the shape each renderer needs instead of being
// narrowed with `in` guards and casts. Function-valued members use z.custom
// with a typeof check because zod cannot otherwise validate functions.
export const openApiReferencePageDataSchema = z.object({
  title: z.string(),
  getOpenAPIPageProps: z.custom<() => OpenAPIPageProps>(value => typeof value === 'function'),
  getSchema: z.custom<OpenApiSchemaPageData['getSchema']>(value => typeof value === 'function'),
});

// A TOC entry's `title` is a ReactNode, which admits nearly any runtime value
// (string, number, element, fragment, null, ...), so it is not runtime-checkable;
// the structural fields are validated. looseObject keeps extra members such as
// remark-steps' `_step` intact.
const tocItemSchema: z.ZodType<TOCItemType> = z.looseObject({
  title: z.custom<ReactNode>(() => true),
  url: z.string(),
  depth: z.number(),
});

export const referenceMdxPageDataSchema = z.object({
  title: z.string(),
  full: z.boolean().optional().catch(undefined),
  toc: z.array(tocItemSchema),
  body: z.custom<ReferenceMdxPageData['body']>(value => typeof value === 'function'),
});
