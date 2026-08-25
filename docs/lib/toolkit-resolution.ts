import { fetchToolkitFromProduction } from '@/lib/toolkit-api';
import { getToolkitBySlug } from '@/lib/toolkit-data';
import { isPublicToolkitSlug } from '@/lib/public-toolkit-policy';
import type { Toolkit } from '@/types/toolkit';

export async function resolveToolkit(slug: string): Promise<Toolkit | null> {
  if (!isPublicToolkitSlug(slug)) return null;

  const snapshotToolkit = await getToolkitBySlug(slug);
  if (snapshotToolkit) return snapshotToolkit;

  return fetchToolkitFromProduction(slug);
}
