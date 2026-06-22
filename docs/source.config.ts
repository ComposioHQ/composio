import {
  defineConfig,
  defineDocs,
  defineCollections,
  frontmatterSchema,
  metaSchema,
  applyMdxPreset,
} from 'fumadocs-mdx/config';
import { transformerTwoslash } from '@shikijs/twoslash';
import { createFileSystemTypesCache } from '@shikijs/vitepress-twoslash/cache-fs';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { z } from 'zod';

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections

// Extended schema with keywords for search
const docsSchema = frontmatterSchema.extend({
  keywords: z.array(z.string()).optional(),
  /** Controls which LLM guardrail set is appended to the .md output.
   *  - undefined / omitted → default session-based guardrails
   *  - "direct-execution" → softer guardrails acknowledging this is the low-level API
   *  - "none" → no guardrails appended */
  llmGuardrails: z.enum(['direct-execution', 'none']).optional(),
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

// Reference docs use defineCollections with custom mdxOptions to exclude twoslash
// (SDK reference docs are auto-generated and don't need type checking)
export const reference = defineDocs({
  dir: 'content/reference',
  docs: {
    schema: docsSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
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

export const cookbooks = defineDocs({
  dir: 'content/cookbooks',
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

export const toolkits = defineDocs({
  dir: 'content/toolkits',
  docs: {
    schema: docsSchema,
    files: ['**/*', '!faq/**'],
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export const changelog = defineCollections({
  type: 'doc',
  dir: 'content/changelog',
  postprocess: {
    includeProcessedMarkdown: true,
  },
  schema: frontmatterSchema.extend({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'Date must be in YYYY-MM-DD format (e.g., "2025-12-29")',
    }),
  }),
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
    rehypeCodeOptions: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      // Twoslash for type checking only - no hover UI
      transformers:
        process.env.NODE_ENV === 'production'
          ? [
              transformerTwoslash({
                explicitTrigger: false,
                twoslashOptions: {
                  compilerOptions: {
                    jsx: 4, // JsxEmit.ReactJSX
                    jsxImportSource: 'react',
                    // Twoslash type-checks code blocks in its own virtual TS
                    // environment, which carries a `baseUrl` default that TS 6
                    // flags as deprecated (TS5101). Silence it here, mirroring
                    // the root tsconfig.json, so production builds don't fail.
                    ignoreDeprecations: '6.0',
                    // TS 6 no longer auto-includes `@types/node` ambiently the
                    // way 5.9 did, so code blocks using Node globals (`crypto`,
                    // `process`, `Buffer`) fail to resolve them (TS2591). Pull
                    // node types in explicitly to restore that.
                    types: ['node'],
                  },
                },
                typesCache: createFileSystemTypesCache({
                  dir: '.next/cache/twoslash',
                }),
                renderer: {
                  // Empty renderer - type checks but renders nothing
                  nodeStaticInfo: () => ({}),
                  nodeError: () => ({}),
                  nodeQuery: () => ({}),
                  nodeCompletion: () => ({}),
                },
              }),
            ]
          : [],
    },
  },
});
