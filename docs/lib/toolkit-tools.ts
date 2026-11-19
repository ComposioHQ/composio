import { apiToolListSchema } from './toolkit-schema';
import type { Toolkit, Tool } from '../types/toolkit';

export async function fetchDetailedTools(toolkit: Toolkit): Promise<Tool[]> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return toolkit.tools;

  const apiBase = process.env.COMPOSIO_API_BASE || 'https://backend.composio.dev/api/v3';
  const params = new URLSearchParams({
    toolkit_slug: toolkit.slug.toUpperCase(),
    [`toolkit_versions[${toolkit.slug}]`]: 'latest',
    include_pricing: 'true',
    limit: '1000',
  });
  try {
    const response = await fetch(`${apiBase}/tools?${params}`, {
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return toolkit.tools;
    const parsed = apiToolListSchema.safeParse(await response.json());
    if (!parsed.success) return toolkit.tools;
    const details = new Map(parsed.data.map(tool => [tool.slug, tool]));
    // Accept new releases (and snapshot misses) when the response covers the
    // catalog. A stale or truncated response can only enrich existing tools.
    if (toolkit.tools.every(tool => details.has(tool.slug))) return parsed.data;
    return toolkit.tools.map(tool => details.get(tool.slug) ?? tool);
  } catch {
    return toolkit.tools;
  }
}
