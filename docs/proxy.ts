import { NextRequest, NextResponse } from 'next/server';

/**
 * Serves markdown when AI agents request it via Accept: text/markdown header.
 * Test: curl -H "Accept: text/markdown" http://localhost:3000/docs/quickstart
 */
export function proxy(request: NextRequest) {
  const accept = request.headers.get('accept') || '';

  if (accept.includes('text/markdown') || accept.includes('text/plain')) {
    const mdUrl = new URL(`/llms.mdx${request.nextUrl.pathname}`, request.nextUrl.origin);
    return NextResponse.rewrite(mdUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|llms|.*\\..*).*)'],
};
