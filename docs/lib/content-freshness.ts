import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import persistedFreshness from '../.generated/content-freshness.json';

export const contentFreshnessSchema = z.object({
  version: z.literal(1),
  pages: z.record(z.string(), z.iso.datetime({ offset: true })),
});

export type ContentFreshnessManifest = z.infer<typeof contentFreshnessSchema>;

/** Read only the persisted build artifact: deployed functions never need Git. */
export function createPageLastUpdatedReader(manifestPath: string) {
  let manifest: Promise<ContentFreshnessManifest | null> | undefined;
  return async (pathname: string): Promise<string | null> => {
    manifest ??= readFile(manifestPath, 'utf8').then(
      text => contentFreshnessSchema.parse(JSON.parse(text)),
    ).catch(() => null);
    const data = await manifest;
    return data && Object.hasOwn(data.pages, pathname) ? data.pages[pathname] ?? null : null;
  };
}

// Bundle the artifact so deployed routes do not depend on a runtime filesystem path.
const persistedManifest = contentFreshnessSchema.parse(persistedFreshness);
export const getPageLastUpdated = async (pathname: string): Promise<string | null> =>
  Object.hasOwn(persistedManifest.pages, pathname) ? persistedManifest.pages[pathname] ?? null : null;
