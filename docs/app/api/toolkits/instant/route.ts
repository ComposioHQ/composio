import { fetchInstantToolkitSlugs } from '@/lib/instant-toolkit-api';

export async function GET() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return Response.json({ error: 'Instant toolkit availability is temporarily unavailable.' }, { status: 503 });
  try {
    const slugs = await fetchInstantToolkitSlugs(apiKey);
    return Response.json({ slugs }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
  } catch {
    return Response.json({ error: 'Instant toolkit availability is temporarily unavailable.' }, { status: 503 });
  }
}
