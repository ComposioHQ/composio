import { apiToolListSchema } from './toolkit-schema';
import type { Toolkit, Tool } from '../types/toolkit';

export async function fetchDetailedTools(toolkit: Toolkit): Promise<Tool[]> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return toolkit.tools;

  const apiBase = process.env.COMPOSIO_API_BASE || 'https://backend.composio.dev/api/v3';
  // Version the cache key with the generated catalog instead of reusing an old
  // response for the mutable "latest" alias across data-sync deployments.
  const params = new URLSearchParams({
    toolkit_slug: toolkit.slug.toUpperCase(),
    [`toolkit_versions[${toolkit.slug}]`]: toolkit.version || 'latest',
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
    // A snapshot miss has metadata but no inventory yet; use production's list.
    if (toolkit.tools.length === 0 && toolkit.toolCount > 0) return parsed.data;

    // The sync owns the inventory. Runtime requests only add parameter schemas,
    // so a stale, empty, or truncated response cannot replace the refreshed list.
    const details = new Map(parsed.data.map(tool => [tool.slug, tool]));
    return toolkit.tools.map(tool => details.get(tool.slug) ?? tool);
  } catch {
    return toolkit.tools;
  }
}
