import { fetchToolkitFromProduction } from '@/lib/toolkit-api';
import { getToolkitBySlug } from '@/lib/toolkit-data';
import type { Toolkit } from '@/types/toolkit';

export async function resolveToolkit(slug: string): Promise<Toolkit | null> {
  const snapshotToolkit = await getToolkitBySlug(slug);
  if (snapshotToolkit) return snapshotToolkit;

  return fetchToolkitFromProduction(slug);
}
