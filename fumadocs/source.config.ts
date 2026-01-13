import {
  defineConfig,
  defineDocs,
  defineCollections,
  frontmatterSchema,
  metaSchema,
  applyMdxPreset,
} from 'fumadocs-mdx/config';
import { transformerTwoslash } from '@shikijs/twoslash';
import { z } from 'zod';

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections

// Extended schema with keywords for search
const docsSchema = frontmatterSchema.extend({
  keywords: z.array(z.string()).optional(),
});

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: docsSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export const toolRouter = defineDocs({
  dir: 'content/tool-router',
  docs: {
    schema: docsSchema,
  },
  meta: {
    schema: metaSchema,
  },
});

// Reference docs use defineCollections with custom mdxOptions to exclude twoslash
// (SDK reference docs are auto-generated and don't need type checking)
export const reference = defineDocs({
  dir: 'content/reference',
  docs: {
    schema: docsSchema,
    mdxOptions: applyMdxPreset({
      rehypeCodeOptions: {
        themes: {
          light: 'github-light',
          dark: 'github-dark',
        },
        // No twoslash transformer - SDK reference docs skip type checking
      },
    }),
  },
  meta: {
    schema: metaSchema,
  },
});

export const examples = defineDocs({
  dir: 'content/examples',
  docs: {
    schema: docsSchema,
  },
  meta: {
    schema: metaSchema,
  },
});

export const toolkits = defineDocs({
  dir: 'content/toolkits',
  docs: {
    schema: docsSchema,
  },
  meta: {
    schema: metaSchema,
  },
});

export const changelog = defineCollections({
  type: 'doc',
  dir: 'content/changelog',
  schema: frontmatterSchema.extend({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'Date must be in YYYY-MM-DD format (e.g., "2025-12-29")',
    }),
  }),
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      transformers: [
        transformerTwoslash({
          explicitTrigger: false, // All TypeScript blocks are validated
        }),
      ],
    },
  },
});
