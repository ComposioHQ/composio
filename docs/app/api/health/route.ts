import { NextResponse } from 'next/server';
import {
  API_V31_SPEC_URL,
  AUTHORIZATION_SERVER_METADATA_URL,
} from '@/lib/agent-discovery';

async function check(url: string) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
    });

    return {
      status: response.ok ? 'pass' : 'fail',
      observedValue: response.status,
      output: response.ok ? 'reachable' : `unexpected status ${response.status}`,
      time: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'fail',
      output: error instanceof Error ? error.message : 'request failed',
      time: new Date().toISOString(),
    };
  }
}

export async function GET() {
  const [specCheck, authCheck] = await Promise.all([
    check(API_V31_SPEC_URL),
    check(AUTHORIZATION_SERVER_METADATA_URL),
  ]);

  const passing = [specCheck, authCheck].every((entry) => entry.status === 'pass');
  const body = {
    status: passing ? 'pass' : 'fail',
    version: '1',
    serviceId: 'docs.composio.dev/agent-discovery',
    description: 'Health status for agent discovery resources published by the Composio docs site.',
    checks: {
      openapi: [specCheck],
      oauth: [authCheck],
    },
  };

  return NextResponse.json(body, {
    status: passing ? 200 : 503,
    headers: {
      'Content-Type': 'application/health+json',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}
