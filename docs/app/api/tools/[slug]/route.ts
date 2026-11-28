import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { APIError } from '@composio/client';
import { instantSchema } from '@/lib/instant';
import { createComposioClientFromEnv } from '@/lib/composio-api';

const toolDetailsSchema = z.object({
  input_parameters: z.unknown().optional(),
  parameters: z.unknown().optional(),
  output_parameters: z.unknown().optional(),
  response: z.unknown().optional(),
  instant: instantSchema,
});

// COMPOSIO_BASE_URL selects the API host; production by default.
const client = process.env.COMPOSIO_API_KEY
  ? createComposioClientFromEnv(process.env, { revalidate: 3600 })
  : null;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const version = request.nextUrl.searchParams.get('version') || 'latest';

  if (!client) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  if (!slug || !/^[A-Z0-9_]+$/i.test(slug)) {
    return NextResponse.json({ error: 'Invalid tool slug' }, { status: 400 });
  }

  try {
    const response = await client.tools.retrieve(slug.toUpperCase(), {
      version,
      ...(version === 'latest' ? { include_pricing: true } : {}),
    });
    const tool = toolDetailsSchema.parse(response);

    const inputSchema = tool.input_parameters || tool.parameters;
    const outputSchema = tool.output_parameters || tool.response;

    return NextResponse.json({
      input_parameters: inputSchema || null,
      output_parameters: outputSchema || null,
      ...(version === 'latest' && tool.instant ? { instant: tool.instant } : {}),
    });
  } catch (error) {
    if (error instanceof APIError && error.status !== undefined && error.status < 500) {
      return NextResponse.json({ error: 'Tool not found' }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to fetch tool' }, { status: 500 });
  }
}
