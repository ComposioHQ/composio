'use client';

import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Check, ChevronRight, Copy } from 'lucide-react';

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
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const copyDetails = async () => {
    const text = contentRef.current?.innerText.trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <details className="group mt-3 mb-6 text-sm text-fd-muted-foreground">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 select-none hover:text-fd-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
        Implementation details{title ? `: ${title}` : ''}
      </summary>
      <div className="for-agent-content relative mt-3 px-4 pt-11 pb-4" ref={contentRef}>
        <button
          type="button"
          onClick={copyDetails}
          aria-label={copied ? 'Copied implementation details' : 'Copy implementation details'}
          title={copied ? 'Copied' : 'Copy implementation details'}
          className="absolute top-2 left-2 inline-flex size-7 items-center justify-center rounded-md border border-fd-border bg-fd-background/70 text-fd-muted-foreground shadow-sm backdrop-blur transition-[background-color,border-color,color,transform] duration-150 hover:border-fd-muted-foreground/40 hover:bg-fd-accent hover:text-fd-foreground active:scale-90"
        >
          <span className="relative size-3.5">
            <Copy
              aria-hidden="true"
              className={
                'absolute inset-0 size-3.5 transition-all duration-200 ease-out ' +
                (copied ? 'scale-50 opacity-0' : 'scale-100 opacity-100')
              }
            />
            <Check
              aria-hidden="true"
              className={
                'absolute inset-0 size-3.5 text-emerald-400 transition-all duration-200 ease-out ' +
                (copied ? 'scale-100 opacity-100' : 'scale-50 opacity-0')
              }
            />
          </span>
        </button>
        {children}
      </div>
    </details>
  );
}
