'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Bot, FileText, Terminal, Copy, Check, ExternalLink } from 'lucide-react';

function CopyableCommand({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => { clearTimeout(timerRef.current); }, []);

  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          clearTimeout(timerRef.current);
          setCopied(true);
          timerRef.current = setTimeout(() => setCopied(false), 2000);
        } catch {
          // clipboard write failed
        }
      }}
      aria-label={`Copy command: ${text}`}
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-fd-border bg-fd-background dark:bg-fd-background/50 px-3 py-[7px] font-mono text-[12.5px] text-fd-foreground transition-colors hover:border-[var(--composio-orange)]/40"
    >
      <span className="select-none text-fd-muted-foreground/50">$</span>
      <span className="min-w-0 flex-1 overflow-x-auto text-left whitespace-nowrap">{text}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-fd-muted-foreground/50" />
      )}
    </button>
  );
}

export function AIToolsBanner() {
  return (
    <div className="not-prose relative mt-4 mb-4 sm:mt-6 sm:mb-6 overflow-hidden rounded-xl border border-fd-border bg-fd-card @container">
      {/* Shader gradient blobs — same as PromptBanner */}
      <div
        className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(242,139,60,0.15) 0%, rgba(242,139,60,0) 70%)' }}
      />
      <div
        className="pointer-events-none absolute right-10 -bottom-20 h-56 w-56 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(242,139,60,0.1) 0%, rgba(242,139,60,0) 70%)' }}
      />
      <div
        className="pointer-events-none absolute right-32 -top-16 h-44 w-44 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.08) 0%, rgba(251,191,36,0) 70%)' }}
      />
      <div className="relative flex flex-col gap-3 p-4 sm:px-5 sm:py-4">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--composio-orange)]/10">
            <Bot aria-hidden="true" className="h-4 w-4 text-[var(--composio-orange)]" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-fd-foreground">
            For AI tools
          </span>
        </div>

        {/* Two-column: Skills + CLI */}
        <div className="flex flex-col gap-3 @2xl:flex-row @2xl:gap-4">
          {/* Skills */}
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--composio-orange)]">Skills</span>
            <CopyableCommand text="npx skills add composiohq/skills" />
            <div className="flex items-center gap-2.5 pl-0.5 text-[11px]">
              <Link
                href="https://skills.sh/composiohq/skills/composio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-fd-muted-foreground hover:text-[var(--composio-orange)] transition-colors"
              >
                Skills.sh
                <ExternalLink aria-hidden="true" className="ml-1 inline h-2.5 w-2.5" />
              </Link>
              <Link
                href="https://github.com/composiohq/skills"
                target="_blank"
                rel="noopener noreferrer"
                className="text-fd-muted-foreground hover:text-[var(--composio-orange)] transition-colors"
              >
                GitHub
                <ExternalLink aria-hidden="true" className="ml-1 inline h-2.5 w-2.5" />
              </Link>
            </div>
          </div>

          {/* CLI */}
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--composio-orange)]">CLI</span>
            <CopyableCommand text="curl -fsSL https://composio.dev/install | bash" />
            <div className="flex items-center gap-2.5 pl-0.5 text-[11px]">
              <Link
                href="/docs/cli"
                className="inline-flex items-center gap-1 text-fd-muted-foreground hover:text-[var(--composio-orange)] transition-colors"
              >
                <Terminal aria-hidden="true" className="h-2.5 w-2.5" />
                CLI Reference
              </Link>
            </div>
          </div>
        </div>

        {/* Context row */}
        <div className="flex flex-wrap items-center gap-2.5 border-t border-fd-border pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--composio-orange)]">Context</span>
          <Link
            href="/llms.txt"
            className="group flex items-center gap-1.5 rounded-lg border border-fd-border bg-fd-background dark:bg-fd-background/30 px-3 py-1.5 transition-all hover:border-[var(--composio-orange)]/40"
          >
            <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fd-muted-foreground group-hover:text-[var(--composio-orange)] transition-colors" />
            <span className="text-[12.5px] font-medium text-fd-foreground">llms.txt</span>
            <span className="text-[10px] text-fd-muted-foreground">Index</span>
          </Link>
          <Link
            href="/llms-full.txt"
            className="group flex items-center gap-1.5 rounded-lg border border-fd-border bg-fd-background dark:bg-fd-background/30 px-3 py-1.5 transition-all hover:border-[var(--composio-orange)]/40"
          >
            <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fd-muted-foreground group-hover:text-[var(--composio-orange)] transition-colors" />
            <span className="text-[12.5px] font-medium text-fd-foreground">llms-full.txt</span>
            <span className="text-[10px] text-fd-muted-foreground">Complete</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
