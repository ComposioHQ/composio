import { z } from 'zod';
import type { ToolkitSummary } from '../types/toolkit';

export const instantToolkitSlugsSchema = z.object({ slugs: z.array(z.string()) });

export function filterToolkits(toolkits: ToolkitSummary[], search: string, instantOnly: boolean) {
  const query = search.trim().toLowerCase();
  return toolkits.filter(toolkit =>
    (!instantOnly || toolkit.instant?.supported === true) &&
    (!query || toolkit.name.toLowerCase().includes(query) || toolkit.slug.toLowerCase().includes(query))
  );
}

export function withInstantEligibility(toolkits: ToolkitSummary[], slugs: string[]): ToolkitSummary[] {
  const supported = new Set(slugs.map(slug => slug.toLowerCase()));
  return toolkits.map(toolkit => ({ ...toolkit, instant: { supported: supported.has(toolkit.slug.toLowerCase()) } }));
}
