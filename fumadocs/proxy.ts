import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validatePath, VALID_PATH_PREFIXES } from '@/lib/path-validation';

/**
 * Content negotiation proxy for AI agents (Next.js 16)
 *
 * Allows AI agents to request raw MDX content (converted to pure markdown) by:
 * 1. Appending .mdx to the URL (e.g., /docs/quickstart.mdx)
 * 2. Using Accept header: text/markdown or text/x-markdown
 *
 * Security:
 * - Uses unified path validation from lib/path-validation.ts
 * - Validates paths to prevent traversal attacks
 * - Handles double encoding, unicode normalization
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if requesting .mdx extension
  if (pathname.endsWith('.mdx') || pathname.endsWith('.MDX')) {
    const basePath = pathname.slice(0, -4); // Remove .mdx
    const validation = validatePath(basePath);

    if (!validation.valid) {
      return new NextResponse(validation.error, { status: 400 });
    }

    // Rewrite to path-based API route: /api/mdx-content/docs/quickstart
    const rewriteUrl = new URL(`/api/mdx-content${validation.path}`, request.url);
    return NextResponse.rewrite(rewriteUrl);
  }

  // Check Accept header for markdown preference
  const acceptHeader = request.headers.get('accept') || '';
  const prefersMarkdown =
    acceptHeader.includes('text/markdown') ||
    acceptHeader.includes('text/x-markdown') ||
    acceptHeader.includes('text/mdx');

  if (prefersMarkdown) {
    const validation = validatePath(pathname);

    if (validation.valid) {
      // Rewrite to path-based API route
      const rewriteUrl = new URL(`/api/mdx-content${validation.path}`, request.url);
      return NextResponse.rewrite(rewriteUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Match documentation paths (including index pages and .mdx requests)
  matcher: [
    // Index pages
    '/docs',
    '/tool-router',
    '/reference',
    '/examples',
    // Index .mdx requests (e.g., /docs.mdx)
    '/docs.mdx',
    '/tool-router.mdx',
    '/reference.mdx',
    '/examples.mdx',
    // Nested paths
    '/docs/:path*',
    '/tool-router/:path*',
    '/reference/:path*',
    '/examples/:path*',
  ],
};
