import { NextResponse } from 'next/server';
import { DOCS_BASE_URL } from '@/lib/agent-discovery';

export async function GET() {
  return NextResponse.json(
    {
      serverInfo: {
        name: 'Composio MCP',
        version: 'v3',
      },
      transport: {
        type: 'streamable-http',
        urlTemplate: 'https://backend.composio.dev/v3/mcp/{session_id}?user_id={user_id}',
        install: {
          url: 'https://dashboard.composio.dev/~/org/connect',
          docs: `${DOCS_BASE_URL}/docs/configuring-sessions`,
          instructions:
            'Create a Composio session or use Composio For You to obtain a user or session-specific MCP URL before connecting a client.',
        },
      },
      capabilities: {
        tools: {
          listChanged: true,
        },
        resources: {
          listChanged: false,
          subscribe: false,
        },
        prompts: {
          listChanged: false,
        },
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    }
  );
}
