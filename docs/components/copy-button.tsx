'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Copy-to-clipboard icon button, designed to live in the dark code header of the
 * @pierre/diffs widgets. A faint chip that lifts on hover, presses on click, and
 * crossfades the copy glyph into a green check on success. Icon-only; the caller
 * positions it (usually absolute top-right).
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
        'inline-flex size-7 items-center justify-center rounded-md border ' +
        'border-white/10 bg-white/[0.04] text-zinc-400 shadow-sm backdrop-blur-md ' +
        'transition-[transform,background-color,border-color,color] duration-150 ease-out ' +
        'hover:border-white/20 hover:bg-white/[0.1] hover:text-zinc-100 ' +
        'active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 ' +
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
