'use client';

import { useState, useCallback } from 'react';
import { Copy, Check, Loader2, ExternalLink, BotMessageSquare } from 'lucide-react';
import { Feedback } from './feedback';
import { toggleDecimalWidget } from './ask-ai-button';

interface PageActionsProps {
  path: string;
}

/**
 * Actions for the current page: copy markdown, open as markdown.
 * Provides AI-friendly access to documentation content.
 */
export function PageActions({ path }: PageActionsProps) {
  const [copyState, setCopyState] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle');

  const handleCopy = useCallback(async () => {
    if (copyState === 'loading') return;
    setCopyState('loading');

    try {
      const response = await fetch(`${path}.md`);
      if (!response.ok) throw new Error('Failed to fetch');

      const markdown = await response.text();
      await navigator.clipboard.writeText(markdown);

      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }, [path, copyState]);

  const getCopyIcon = () => {
    switch (copyState) {
      case 'loading':
        return (
          <Loader2
            className="size-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        );
      case 'copied':
        return (
          <Check
            className="size-3.5 text-emerald-500 dark:text-emerald-400"
            aria-hidden="true"
          />
        );
      case 'error':
        return (
          <Copy
            className="size-3.5 text-red-500 dark:text-red-400"
            aria-hidden="true"
          />
        );
      default:
        return <Copy className="size-3.5" aria-hidden="true" />;
    }
  };

  const getCopyLabel = () => {
    switch (copyState) {
      case 'loading':
        return 'Copying…';
      case 'copied':
        return 'Copied!';
      case 'error':
        return 'Failed';
      default:
        return 'Copy page';
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 sm:gap-1 mt-2 mb-6"
      role="group"
      aria-label="Page actions"
    >
      {/* Copy Button */}
      <button
        type="button"
        onClick={handleCopy}
        disabled={copyState === 'loading'}
        className="inline-flex items-center gap-1.5 px-3 py-2 sm:px-2.5 sm:py-1.5 text-xs font-medium
          text-fd-muted-foreground hover:text-fd-foreground
          bg-fd-secondary/50 hover:bg-fd-secondary
          rounded-md
          transition-all duration-150 ease-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background
          disabled:pointer-events-none
          active:scale-[0.98]
          touch-manipulation
          motion-reduce:transition-none motion-reduce:active:scale-100"
        aria-label="Copy page as markdown"
        aria-live="polite"
      >
        <span className="transition-transform duration-150 ease-out">
          {getCopyIcon()}
        </span>
        <span>{getCopyLabel()}</span>
      </button>

      {/* View Markdown Link */}
      <a
        href={`${path}.md`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-2 sm:px-2.5 sm:py-1.5 text-xs font-medium
          text-fd-muted-foreground hover:text-fd-foreground
          bg-fd-secondary/50 hover:bg-fd-secondary
          rounded-md
          transition-all duration-150 ease-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background
          active:scale-[0.98]
          touch-manipulation
          motion-reduce:transition-none motion-reduce:active:scale-100"
        aria-label="View page as markdown (opens in new tab)"
      >
        <ExternalLink className="size-3.5" aria-hidden="true" />
        <span className="hidden xs:inline">View </span>
        <span>Markdown</span>
      </a>

      {/* Divider - hidden on mobile when wrapped */}
      <span
        className="hidden sm:block mx-1 h-4 w-px bg-fd-border/60"
        role="separator"
        aria-orientation="vertical"
      />

      {/* Ask AI */}
      <button
        type="button"
        onClick={toggleDecimalWidget}
        className="inline-flex items-center gap-1.5 px-3 py-2 sm:px-2.5 sm:py-1.5 text-xs font-medium
          text-fd-muted-foreground hover:text-fd-foreground
          bg-fd-secondary/50 hover:bg-fd-secondary
          rounded-md
          transition-all duration-150 ease-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background
          active:scale-[0.98]
          touch-manipulation
          motion-reduce:transition-none motion-reduce:active:scale-100"
        aria-label="Ask AI"
      >
        <BotMessageSquare className="size-3.5" aria-hidden="true" />
        <span>Ask AI</span>
      </button>

      {/* Feedback */}
      <Feedback page={path} />
    </div>
  );
}
