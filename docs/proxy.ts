import { NextRequest, NextResponse } from 'next/server';

/**
 * Convert kebab-case to camelCase
 */
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Proxy handles:
 * 1. Markdown content negotiation for AI agents (Accept: text/markdown)
 * 2. Redirects for old Fern API reference URLs (kebab-case → camelCase)
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accept = request.headers.get('accept') || '';

  // Handle markdown content negotiation for AI agents
  if (accept.includes('text/markdown') || accept.includes('text/plain')) {
    const mdUrl = new URL(`/llms.mdx${pathname}`, request.nextUrl.origin);
    return NextResponse.rewrite(mdUrl);
  }

  // Handle old Fern API reference URLs (kebab-case → camelCase)
  // Example: /reference/api-reference/tools/get-tools → /reference/api-reference/tools/getTools
  if (pathname.startsWith('/reference/api-reference/')) {
    const segments = pathname.split('/');

    // Convert kebab-case segments to camelCase (only operation IDs after index 3)
    // Structure: /reference/api-reference/{tag}/{operationId}
    const newSegments = segments.map((segment, index) => {
      if (index <= 3) return segment; // Keep /reference/api-reference/{tag} as-is
      return kebabToCamel(segment);
    });

    const newPathname = newSegments.join('/');
    if (newPathname !== pathname) {
      const url = request.nextUrl.clone();
      url.pathname = newPathname;
      return NextResponse.redirect(url, 301);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|llms|.*\\..*).*)'],
};
