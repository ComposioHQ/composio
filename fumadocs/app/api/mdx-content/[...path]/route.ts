import { NextResponse } from 'next/server';
import {
  source,
  toolRouterSource,
  referenceSource,
  examplesSource,
} from '@/lib/source';
import {
  validatePathSegments,
  escapeYaml,
  VALID_PATH_PREFIXES,
  type ValidPrefix,
} from '@/lib/path-validation';
import { convertMdxToMarkdown } from '@/lib/mdx-to-markdown';

/**
 * Source mapping for each prefix
 * Uses a more permissive type since referenceSource includes OpenAPI pages
 */
const SOURCE_MAP = {
  '/docs': source,
  '/tool-router': toolRouterSource,
  '/reference': referenceSource,
  '/examples': examplesSource,
} as const;

/**
 * API route to serve raw MDX content as pure Markdown for AI agents.
 *
 * URL: /api/mdx-content/docs/quickstart
 * Also accessible via: /docs/quickstart.mdx (through proxy.ts)
 *
 * Returns: Pure markdown text (JSX components converted to markdown)
 *
 * Security:
 * - Validates paths to prevent traversal attacks
 * - Escapes YAML frontmatter to prevent injection
 * - Only serves content from known sources
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const validation = validatePathSegments(pathSegments);

  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    );
  }

  const { path, prefix } = validation;

  try {
    const sourceLoader = SOURCE_MAP[prefix];
    if (!sourceLoader) {
      return NextResponse.json(
        { error: 'Invalid source' },
        { status: 400 }
      );
    }

    // Get slugs by removing the prefix
    const slugs = path.split('/').filter(Boolean).slice(1);
    const page = sourceLoader.getPage(slugs);

    if (!page) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      );
    }

    // Check if page supports getText (MDX pages only, not OpenAPI)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageData = page.data as any;

    if (typeof pageData.getText !== 'function') {
      return NextResponse.json(
        { error: 'Content not available for this page type' },
        { status: 400 }
      );
    }

    // Get the processed markdown content with timeout
    let rawContent: string;
    try {
      const contentPromise = pageData.getText('processed');
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Content retrieval timeout')), 10000)
      );
      rawContent = await Promise.race([contentPromise, timeoutPromise]);
    } catch (textError) {
      // getText may fail if includeProcessedMarkdown is not enabled
      const msg = textError instanceof Error ? textError.message : 'Unknown error';
      if (msg.includes('includeProcessedMarkdown')) {
        return NextResponse.json(
          { error: 'Raw markdown export is not enabled for this source' },
          { status: 400 }
        );
      }
      if (msg === 'Content retrieval timeout') {
        return NextResponse.json(
          { error: 'Request timeout' },
          { status: 504 }
        );
      }
      throw textError;
    }

    // Convert MDX with JSX components to pure markdown
    const pureMarkdown = convertMdxToMarkdown(rawContent);

    // Build safe YAML frontmatter
    const title = pageData.title || 'Untitled';
    const description = pageData.description || '';
    const pageUrl = page.url || path;

    const mdxContent = `---
title: ${escapeYaml(title)}
description: ${escapeYaml(description)}
url: https://composio.dev${pageUrl}
---

${pureMarkdown}`;

    return new NextResponse(mdxContent, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[mdx-content] Error:', message);

    return NextResponse.json(
      { error: 'Failed to retrieve content' },
      { status: 500 }
    );
  }
}
