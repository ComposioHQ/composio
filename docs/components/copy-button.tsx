'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Small copy-to-clipboard button, positioned by the caller (usually top-right). */
export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label="Copy code"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard unavailable (e.g. insecure context); ignore
        }
      }}
      className={
        'inline-flex items-center gap-1 rounded-sm border border-fd-border bg-fd-background/80 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.05em] text-fd-foreground/60 backdrop-blur transition-colors hover:text-fd-foreground ' +
        (className ?? '')
      }
    >
      {copied ? <Check aria-hidden="true" className="size-3" /> : <Copy aria-hidden="true" className="size-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}
