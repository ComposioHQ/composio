import { preloadFile } from '@pierre/diffs/ssr';
import { RepoBrowserClient, type RepoFile } from './repo-browser-client';
import sourceData from '@/lib/imessage-source.json';

interface SourceFile {
  path: string;
  contents: string;
  composio: boolean;
}

/**
 * ImessageRepoBrowser — a browsable slice of the iMessage-on-eve example
 * project as a file tree plus code viewer. The Composio touch-points (the
 * custom toolkit, the eve provider, the session) carry the integration; the
 * rest is local glue. Each file is prerendered on the server with @pierre/diffs.
 */
export async function ImessageRepoBrowser() {
  const source = sourceData as SourceFile[];

  const files: RepoFile[] = [];
  for (const f of source) {
    const { prerenderedHTML } = await preloadFile({ file: { name: f.path, contents: f.contents } });
    files.push({ ...f, prerenderedHTML });
  }

  return (
    <div className="not-prose my-6">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fd-foreground/45">
        <span className="size-1.5 rounded-full bg-[var(--composio-brand)]" aria-hidden="true" />
        a slice of the real project; the Composio files do the work
      </div>
      <RepoBrowserClient files={files} />
    </div>
  );
}
