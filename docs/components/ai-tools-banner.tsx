'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, FileText, Copy, Check, ExternalLink } from 'lucide-react';

function CopyableCommand({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      aria-label={`Copy command: ${text}`}
      className="mb-3 flex w-full cursor-pointer items-center gap-2 rounded-lg border border-fd-border bg-fd-background dark:bg-fd-background/50 px-3.5 py-2.5 font-mono text-[13px] text-fd-foreground transition-colors hover:border-[var(--composio-orange)]/40"
    >
      <span className="select-none text-fd-muted-foreground">$</span>
      <span className="flex-1 text-left">{text}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-fd-muted-foreground/60" />
      )}
    </button>
  );
}

export function AIToolsBanner() {
  const skillsCommand = 'npx skills add composiohq/skills';

  return (
    <div className="not-prose relative mt-6 mb-6 overflow-hidden rounded-xl border border-fd-border bg-gradient-to-br from-fd-card via-fd-card to-fd-muted/50 dark:from-fd-muted/20 dark:via-fd-card dark:to-fd-muted/40">
      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.02]"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-fd-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-fd-foreground) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="relative p-5">
        {/* Header */}
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-fd-muted dark:bg-fd-muted/60">
            <Bot className="h-4 w-4 text-fd-muted-foreground" />
          </div>
          <span className="text-sm font-semibold text-fd-foreground tracking-tight">
            For AI tools
          </span>
        </div>

        {/* Skills command */}
        <CopyableCommand text={skillsCommand} />

        {/* Skills links */}
        <div className="mb-4 flex items-center gap-3 text-xs">
          <Link
            href="https://skills.sh/composiohq/skills/composio"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-fd-muted-foreground hover:text-[var(--composio-orange)] transition-colors"
          >
            Skills.sh
            <ExternalLink className="h-3 w-3" />
          </Link>
          <Link
            href="https://github.com/composiohq/skills"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-fd-muted-foreground hover:text-[var(--composio-orange)] transition-colors"
          >
            GitHub
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        {/* Context files */}
        <div className="flex gap-2">
          <Link
            href="/llms.txt"
            className="group flex flex-1 items-center gap-2.5 rounded-lg border border-fd-border/80 bg-fd-card dark:bg-fd-background/30 px-3 py-2 transition-all hover:border-[var(--composio-orange)]/40"
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-fd-muted-foreground group-hover:text-[var(--composio-orange)] transition-colors" />
            <span className="text-sm font-medium text-fd-foreground">llms.txt</span>
            <span className="text-[11px] text-fd-muted-foreground">Index</span>
          </Link>
          <Link
            href="/llms-full.txt"
            className="group flex flex-1 items-center gap-2.5 rounded-lg border border-fd-border/80 bg-fd-card dark:bg-fd-background/30 px-3 py-2 transition-all hover:border-[var(--composio-orange)]/40"
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-fd-muted-foreground group-hover:text-[var(--composio-orange)] transition-colors" />
            <span className="text-sm font-medium text-fd-foreground">llms-full.txt</span>
            <span className="text-[11px] text-fd-muted-foreground">Complete</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
