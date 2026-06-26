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
  /** When true, the page shows an "Experimental" badge in the sidebar. */
  experimental: z.boolean().optional(),
  /** When true, the page shows a "New" badge in the sidebar. */
  isNew: z.boolean().optional(),
  /** When true, the page shows a "Legacy" badge at the top of the page. */
  legacy: z.boolean().optional(),
  /** Controls which LLM guardrail set is appended to the .md output.
   *  - undefined / omitted → default session-based guardrails
   *  - "direct-execution" → softer guardrails acknowledging this is the low-level API
   *  - "none" → no guardrails appended */
  llmGuardrails: z.enum(['direct-execution', 'none']).optional(),
  /** Links rendered in the right-hand "Related" rail under the table of contents. */
  related: z
    .array(
      z.object({
        title: z.string(),
        href: z.string(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  /** Presentation metadata for the /examples featured gallery. The card's
   *  title and description come from `title`/`description`; this controls the
   *  category lane, toolkit logos, and whether it surfaces in "Featured". */
  gallery: z
    .object({
      /** Category lanes this example belongs to (can be more than one). */
      categories: z
        .array(
          z.enum(['General agents', 'Background agents', 'Coding agents']),
        )
        .min(1),
      /** Toolkit logo slugs (logos.composio.dev/api/<slug>) shown on the card. */
      logos: z.array(z.string()).default([]),
      /** Surface in the default "Featured" view. */
      featured: z.boolean().optional(),
      /** Sort order within the grid (lower first). */
      order: z.number().optional(),
    })
    .optional(),
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
      // Match the global remark plugins so mermaid diagrams in merged
      // api-overviews render (applyMdxPreset replaces, not merges).
      remarkPlugins: [remarkMdxMermaid],
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
