'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink, FileText } from 'lucide-react';

interface PageActionsProps {
  path: string;
  /**
   * 'overlap-title' (default) lifts the button into the row above via a
   * negative top margin so it lands to the right of `<DocsTitle>`.
   * 'inline' renders the button as a normal inline-block — use when the
   * caller already controls layout (e.g. the Toolkits landing header).
   */
  variant?: 'overlap-title' | 'inline';
}

const FALLBACK_ORIGIN = 'https://docs.composio.dev';

/**
 * Single "Copy page" dropdown with three actions:
 *  - Copy page (fetches the .md and writes to clipboard)
 *  - Open in ChatGPT (deep link with a prefilled prompt)
 *  - Open in Claude (deep link with a prefilled prompt)
 *
 * Sits to the right of the page title via `not-prose -mt-12 mb-2 flex justify-end`
 * so it overlaps the row above (next to <DocsTitle>) without ever crashing into
 * the title text on narrow viewports.
 */
export function PageActions({ path, variant = 'overlap-title' }: PageActionsProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const absoluteMdUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${path}.md`
      : `${FALLBACK_ORIGIN}${path}.md`;

  const chatgptUrl = `https://chatgpt.com/?hints=search&q=${encodeURIComponent(
    `Read ${absoluteMdUrl} so I can ask questions about it.`,
  )}`;
  const claudeUrl = `https://claude.ai/new?q=${encodeURIComponent(
    `Read ${absoluteMdUrl} so I can ask questions about it.`,
  )}`;

  const handleCopy = useCallback(async () => {
    try {
      const response = await fetch(`${path}.md`);
      if (!response.ok) throw new Error('Failed to fetch');
      const markdown = await response.text();
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      setTimeout(() => setOpen(false), 400);
    } catch {
      // best-effort; leave menu open so user can retry
    }
  }, [path]);

  return (
    <div className={variant === 'overlap-title' ? 'not-prose -mt-12 mb-2 flex justify-end' : 'not-prose inline-block'}>
      <div ref={wrapperRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
            text-fd-muted-foreground hover:text-fd-foreground
            bg-fd-secondary/50 hover:bg-fd-secondary
            border border-fd-border/60
            transition-colors duration-150 ease-out
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background
            touch-manipulation"
          style={{ borderRadius: 0 }}
        >
          <Copy className="size-3.5" aria-hidden="true" />
          <span>Copy page</span>
          <ChevronDown
            className={`size-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1 w-[280px] border border-fd-border bg-fd-popover text-fd-popover-foreground shadow-lg"
            style={{ borderRadius: 0 }}
          >
            <MenuItem
              icon={
                copied ? (
                  <Check className="size-4 text-emerald-500" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )
              }
              title={copied ? 'Copied!' : 'Copy page'}
              subtitle="Copy page as Markdown for LLMs"
              onClick={handleCopy}
            />
            <MenuItem
              icon={<FileText className="size-4" aria-hidden="true" />}
              external
              title="View as Markdown"
              subtitle="Open the raw .md source in a new tab"
              href={`${path}.md`}
            />
            <MenuItem
              icon={<ChatGPTMark className="size-4" />}
              external
              title="Open in ChatGPT"
              subtitle="Ask questions about this page"
              href={chatgptUrl}
            />
            <MenuItem
              icon={<ClaudeMark className="size-4" />}
              external
              title="Open in Claude"
              subtitle="Ask questions about this page"
              href={claudeUrl}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
}

function MenuItem({ icon, title, subtitle, href, external, onClick }: MenuItemProps) {
  const className =
    'flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:bg-fd-accent';

  const content = (
    <>
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-fd-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-medium text-fd-foreground">
          {title}
          {external && (
            <ExternalLink className="size-3 text-fd-muted-foreground" aria-hidden="true" />
          )}
        </span>
        <span className="block text-xs text-fd-muted-foreground">{subtitle}</span>
      </span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        role="menuitem"
        className={className}
      >
        {content}
      </a>
    );
  }
  return (
    <button type="button" role="menuitem" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/** Tiny inline OpenAI/ChatGPT mark (flower-gear), monochrome currentColor. */
function ChatGPTMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.077.077 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}

/** Tiny inline Anthropic Claude mark (asterisk/burst), monochrome currentColor. */
function ClaudeMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4.709 15.955l4.72-2.647.079-.23-.079-.128h-.23l-.787-.048-2.687-.073-2.331-.097L1.078 12.6l-.582-.74.058-.385.49-.327.701.063 1.55.105 2.327.16 3.376.198 4.802.205-.018-.07L17.16 7.31l.215.06.21.124.214.214.06.21-.124.214-2.31 2.31-.214.215-.06.21-.124.214.124.214.06.21.214.214 2.31 2.31.124.214.06.21-.21.124-.214.06-.215-.06-3.06-2.06-.31-.16-1.06-.06-.124.06-.06.21.124.214 1.95 2.954.214.214.06.21-.06.21-.214.214.214.214.06.21-.06.21.214.214.214.214-.06.21-.21.124-.214.06-3.06-2.06z" />
    </svg>
  );
}
