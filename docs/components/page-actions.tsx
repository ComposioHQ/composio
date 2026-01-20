'use client';

import { useState } from 'react';
import { Copy, Check, Loader2, ExternalLink } from 'lucide-react';
import { Feedback } from './feedback';

interface PageActionsProps {
  path: string;
}

/**
 * Actions for the current page: copy markdown, open as markdown.
 * Provides AI-friendly access to documentation content.
 */
export function PageActions({ path }: PageActionsProps) {
  const [copyState, setCopyState] = useState<'idle' | 'loading' | 'copied'>('idle');

  const handleCopy = async () => {
    setCopyState('loading');

    try {
      const response = await fetch(`${path}.md`);
      if (!response.ok) throw new Error('Failed to fetch');

      const markdown = await response.text();
      await navigator.clipboard.writeText(markdown);

      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('idle');
    }
  };

  const handleOpen = () => {
    window.open(`${path}.md`, '_blank');
  };

  return (
    <div className="flex items-center gap-4 mt-2 mb-6">
      <button
        onClick={handleCopy}
        disabled={copyState === 'loading'}
        className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground hover:text-fd-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring disabled:opacity-50"
        aria-label="Copy page as markdown"
      >
        {copyState === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : copyState === 'copied' ? (
          <Check className="w-4 h-4 text-green-500" aria-hidden="true" />
        ) : (
          <Copy className="w-4 h-4" aria-hidden="true" />
        )}
        {copyState === 'copied' ? 'Copied!' : 'Copy page'}
      </button>

      <span className="text-fd-muted-foreground/50" aria-hidden="true">·</span>

      <a
        href={`${path}.md`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground hover:text-fd-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
      >
        <ExternalLink className="w-4 h-4" aria-hidden="true" />
        View as markdown
      </a>

      <span className="text-fd-muted-foreground/50" aria-hidden="true">·</span>

      <Feedback page={path} />
    </div>
  );
}
