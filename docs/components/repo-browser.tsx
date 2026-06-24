import { preloadFile } from '@pierre/diffs/ssr';
import { RepoBrowserClient, type RepoFile } from './repo-browser-client';
import slackBot from '@/lib/slack-bot-source.json';
import localWorkbench from '@/lib/local-workbench-source.json';

interface SourceFile {
  path: string;
  contents: string;
  composio: boolean;
}

// JSON imports must be static, so map each example's committed snapshot here and
// pick one with the `source` prop. The default keeps the Slack bot page working.
const SOURCES = { 'slack-bot': slackBot, 'local-workbench': localWorkbench } as const;

/**
 * RepoBrowser — a real slice of an example project as a browsable tree + code
 * viewer. The Composio touch-points are highlighted; each file's code is
 * prerendered on the server with @pierre/diffs.
 */
export async function RepoBrowser({ source = 'slack-bot' }: { source?: keyof typeof SOURCES }) {
  const data = SOURCES[source] as SourceFile[];

  const files: RepoFile[] = [];
  for (const f of data) {
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
