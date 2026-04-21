import { NextResponse } from 'next/server';
import {
  DOCS_BASE_URL,
  API_V31_BASE_URL,
  AUTH_ISSUER,
  AUTH_SCOPES,
} from '@/lib/agent-discovery';

export async function GET() {
  return NextResponse.json(
    {
      resource: API_V31_BASE_URL,
      authorization_servers: [AUTH_ISSUER],
      bearer_methods_supported: ['header', 'cookie'],
      scopes_supported: [...AUTH_SCOPES],
      resource_documentation: `${DOCS_BASE_URL}/docs/authentication`,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    }
  );
}
