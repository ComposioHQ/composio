import { NextResponse } from 'next/server';
import {
  API_HEALTH_URL,
  API_REFERENCE_URL,
  API_V3_BASE_URL,
  API_V3_SPEC_URL,
  API_V31_BASE_URL,
  API_V31_SPEC_URL,
} from '@/lib/agent-discovery';

export async function GET() {
  return NextResponse.json(
    {
      linkset: [
        {
          anchor: API_V31_BASE_URL,
          'service-desc': [
            {
              href: API_V31_SPEC_URL,
              type: 'application/vnd.oai.openapi+json;version=3.1',
            },
          ],
          'service-doc': [
            {
              href: API_REFERENCE_URL,
              type: 'text/html',
            },
          ],
          status: [
            {
              href: API_HEALTH_URL,
              type: 'application/health+json',
            },
          ],
        },
        {
          anchor: API_V3_BASE_URL,
          'service-desc': [
            {
              href: API_V3_SPEC_URL,
              type: 'application/vnd.oai.openapi+json;version=3.0',
            },
          ],
          'service-doc': [
            {
              href: API_REFERENCE_URL,
              type: 'text/html',
            },
          ],
          status: [
            {
              href: API_HEALTH_URL,
              type: 'application/health+json',
            },
          ],
        },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/linkset+json',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    }
  );
}
