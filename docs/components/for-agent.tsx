import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Section-specific implementation details for AI agents.
 *
 * Renders as a subtle, muted "Implementation details" disclosure on the human
 * page. In the page's `.md` output (`/docs/<slug>.md`), `mdxToCleanMarkdown()`
 * in `lib/source.ts` unwraps each block into a `### For AI agents[: title]`
 * heading so agents always find their instructions under a predictable label.
 *
 * Authoring conventions (see docs/AGENTS.md):
 * - Place a block directly under the section it details; a page can have
 *   several. Give each a short `title` naming what it covers.
 * - No markdown headings inside a block (they'd pollute the page TOC with
 *   anchors into a collapsed disclosure). Write sub-section titles as
 *   standalone bold lines (`**Title**`); the .md unwrap promotes them to
 *   #### headings.
 * - Write implementation detail (exact call sequences, argument names,
 *   gotchas, copy-paste snippets) — not a summary of the human guide.
 */
export function ForAgent({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <details className="group mt-3 mb-6 text-sm text-fd-muted-foreground">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 select-none hover:text-fd-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
        Implementation details{title ? `: ${title}` : ''}
      </summary>
      <div className="mt-3 border-l border-fd-border pl-4">{children}</div>
    </details>
  );
}
