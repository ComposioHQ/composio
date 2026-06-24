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


function ClaudeMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      preserveAspectRatio="xMidYMid"
      viewBox="0 0 256 257"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#D97757"
        d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"
      />
    </svg>
  );
}
