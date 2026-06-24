'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Copy-to-clipboard icon button for the code header of the @pierre/diffs widgets.
 * A faint chip that lifts on hover, presses on click, and crossfades the copy
 * glyph into a green check on success.
 *
 * The widget themes itself off the OS `prefers-color-scheme` (its shadow root
 * pins `color-scheme: light dark`), NOT the site's class-based dark toggle, so
 * the header can be light even with the docs in dark mode. The chip's colors
 * live in the `.diff-copy-button` rule in global.css and use `light-dark()` to
 * track that same signal, staying legible on either header. Icon-only; the
 * caller positions it (usually absolute top-right).
 */
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable (e.g. insecure context); ignore
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy code'}
      title={copied ? 'Copied' : 'Copy'}
      className={
        'diff-copy-button inline-flex size-7 items-center justify-center rounded-md border shadow-sm backdrop-blur-md ' +
        'transition-[transform,background-color,border-color,color] duration-150 ease-out ' +
        'active:scale-90 ' +
        (className ?? '')
      }
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
  );
}
