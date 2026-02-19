import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.COMPOSIO_API_BASE || 'https://backend.composio.dev/api/v3';
const API_KEY = process.env.COMPOSIO_API_KEY;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const version = request.nextUrl.searchParams.get('version') || 'latest';

  if (!API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  if (!slug || !/^[A-Z0-9_]+$/i.test(slug)) {
    return NextResponse.json({ error: 'Invalid tool slug' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${API_BASE}/tools/${slug.toUpperCase()}?version=${encodeURIComponent(version)}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        },
        next: { revalidate: 3600 },
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: 'Tool not found' }, { status: response.status });
    }

    const tool = await response.json();

    // Return just the schemas
    const inputSchema = tool.input_parameters || tool.parameters;
    const outputSchema = tool.output_parameters || tool.response;

    return NextResponse.json({
      input_parameters: inputSchema || null,
      output_parameters: outputSchema || null,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch tool' }, { status: 500 });
  }
}
