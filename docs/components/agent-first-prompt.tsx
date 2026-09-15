'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { promptFor, type AgentFirstPromptProps } from '@/lib/agent-prompts';

export function AgentFirstPrompt({ agent }: AgentFirstPromptProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prompt = promptFor(agent);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside className="not-prose my-5 rounded-[12px] border border-fd-border bg-fd-card p-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <p className="text-[13px] font-medium text-fd-foreground">Try the skill</p>
        <button
          aria-label="Copy suggested first prompt"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-fd-foreground/65 transition-colors hover:bg-fd-accent hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
          onClick={copyPrompt}
          type="button"
        >
          {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
          <span aria-live="polite">{copied ? 'Copied' : 'Copy prompt'}</span>
        </button>
      </div>
      <p className="whitespace-pre-line text-[13px] leading-[1.6] text-fd-foreground/70">{prompt}</p>
    </aside>
  );
}
