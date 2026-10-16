import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

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

export const getPageLastUpdated: (pathname: string) => Promise<string | null> =
  createPageLastUpdatedReader(join(process.cwd(), '.generated/content-freshness.json'));
