'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Small icon-only copy-to-clipboard button. Styled to sit subtly in the dark
 * code header (light icon, faint hover), positioned by the caller (top-right).
 */
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label="Copy code"
      title={copied ? 'Copied' : 'Copy'}
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
        'inline-flex size-6 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white/90 ' +
        (className ?? '')
      }
    >
      {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
    </button>
  );
}
