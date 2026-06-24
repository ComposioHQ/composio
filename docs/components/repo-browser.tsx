import { preloadFile } from '@pierre/diffs/ssr';
import { RepoBrowserClient, type RepoFile } from './repo-browser-client';
import { SOURCES, type SourceName } from '@/lib/sources';

/**
 * RepoBrowser — a real slice of an example project as a browsable tree + code
 * viewer, with the Composio touch-points flagged. Each file's code is
 * prerendered on the server with @pierre/diffs.
 *
 * `source` selects which example's snapshot to show (default: the slack-bot /
 * Pi example, so existing pages are unaffected).
 */
export async function RepoBrowser({
  source = 'slack-bot',
  caption = 'a slice of the real project, the Composio files do the work',
}: {
  source?: SourceName;
  caption?: string | null;
}) {
  const sourceData = SOURCES[source];

  const files: RepoFile[] = [];
  for (const f of sourceData) {
    const { prerenderedHTML } = await preloadFile({ file: { name: f.path, contents: f.contents } });
    files.push({ ...f, prerenderedHTML });
  }

  return (
    <div className="not-prose my-6">
      {caption ? (
        <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/45">
          <span className="size-1.5 rounded-full bg-[var(--composio-brand)]" aria-hidden="true" />
          {caption}
        </div>
      ) : null}
      <RepoBrowserClient files={files} />
    </div>
  );
}
