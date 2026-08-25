import { fetchToolkitFromProduction } from '@/lib/toolkit-api';
import { getToolkitBySlug } from '@/lib/toolkit-data';
import { isPublicToolkitSlug } from '@/lib/public-toolkit-policy';
import type { Toolkit } from '@/types/toolkit';

interface ToolkitResolutionDependencies {
  getToolkitBySlug(slug: string): Promise<Toolkit | null>;
  fetchToolkitFromProduction(slug: string): Promise<Toolkit | null>;
}

export function createToolkitResolver(dependencies: ToolkitResolutionDependencies) {
  return async function resolveToolkit(slug: string): Promise<Toolkit | null> {
    if (!isPublicToolkitSlug(slug)) return null;

    const snapshotToolkit = await dependencies.getToolkitBySlug(slug);
    if (snapshotToolkit) return snapshotToolkit;

    return dependencies.fetchToolkitFromProduction(slug);
  };
}

export const resolveToolkit = createToolkitResolver({
  getToolkitBySlug,
  fetchToolkitFromProduction,
});
