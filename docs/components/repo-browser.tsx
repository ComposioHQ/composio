import { preloadFile } from '@pierre/diffs/ssr';
import { RepoBrowserClient, type RepoFile } from './repo-browser-client';
import sourceData from '@/lib/slack-bot-source.json';

interface SourceFile {
  path: string;
  contents: string;
  composio: boolean;
}

/**
 * RepoBrowser — a real slice of the composio-slack-bot project as a browsable
 * tree + code viewer. The Composio touch-points (triggers, sessions, shared
 * connection, proxy) are bundled with the full project on GitHub. Each file's
 * code is prerendered on the server with @pierre/diffs.
 */
export async function RepoBrowser() {
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
        a slice of the real project — the Composio files do the work
      </div>
      <RepoBrowserClient files={files} />
    </div>
  );
}
