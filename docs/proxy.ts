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
 * 3. Sets x-pathname header for 404 logging
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
  // v3.1: /reference/api-reference/{tag}/{operationId}
  // v3.0: /reference/v3/api-reference/{tag}/{operationId}
  const apiRefPrefix = pathname.startsWith('/reference/v3/api-reference/')
    ? '/reference/v3/api-reference/'
    : pathname.startsWith('/reference/api-reference/')
      ? '/reference/api-reference/'
      : null;

  if (apiRefPrefix) {
    const rest = pathname.slice(apiRefPrefix.length);
    const segments = rest.split('/');
    // segments[0] = tag, segments[1+] = operationId parts — only camelCase the operationId
    const newSegments = segments.map((segment, index) => {
      if (index === 0) return segment; // keep tag as-is
      return kebabToCamel(segment);
    });

    const newPathname = apiRefPrefix + newSegments.join('/');
    if (newPathname !== pathname) {
      const url = request.nextUrl.clone();
      url.pathname = newPathname;
      return NextResponse.redirect(url, 301);
    }
  }

  const response = NextResponse.next();
  response.headers.set('x-pathname', pathname);
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|llms|.*\\..*).*)'],
};
