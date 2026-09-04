'use client';

import { Check, Copy } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const SETUP_PROMPT = `Help me add Composio to this project. First, inspect the codebase to understand its framework, agent architecture, authentication, and user or tenant identity model.

Check whether the official \`composio\` Agent Skill is installed. If it is missing, install it for this project with:

\`npx skills add ComposioHQ/composio --skill composio\`

Then load and follow the skill. If installation requires approval, ask for it. If the host does not support skills or installation fails, use the current documentation at [https://docs.composio.dev](https://docs.composio.dev) and report that fallback.

Default to Composio Platform for application codebases. Use Composio For You only when the project clearly configures a personal agent or automation for the developer’s own accounts.

Based on the codebase, explain briefly where Composio would fit. Then ask what I want my users or agent to accomplish with connected apps. If the project suggests likely use cases, offer a few relevant options. If it is not clear whether I want to build Composio into the application or connect it to my coding agent, ask me before making changes.`;

const AGENT_LOGOS = [
  { src: '/images/clients/claude.svg', label: 'Claude' },
  { src: '/images/clients/codex.png', label: 'Codex' },
  { src: '/images/clients/cursor.svg', label: 'Cursor' },
];

export function AgentSetupActions({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(SETUP_PROMPT);
      clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2.5', className)}>
      <Link
        className="inline-flex min-h-10 items-center rounded-full border border-fd-border bg-fd-card px-5 text-[14px] font-medium text-fd-foreground no-underline transition-colors hover:bg-fd-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
        href="/docs/agent-setup"
      >
        Agent setup
      </Link>
      <button
        aria-label="Copy Composio setup prompt"
        className="group inline-flex min-h-10 cursor-pointer items-center rounded-full border border-fd-border bg-fd-card py-1 pl-1.5 pr-4 text-[14px] font-medium text-fd-foreground transition-colors hover:bg-fd-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
        onClick={copyPrompt}
        type="button"
      >
        <span aria-hidden="true" className="mr-3 flex -space-x-1.5">
          {AGENT_LOGOS.map(agent => (
            <span
              className="flex size-7 items-center justify-center rounded-full border border-fd-border bg-fd-background"
              key={agent.label}
            >
              <Image alt="" className="size-4 object-contain" height={16} src={agent.src} width={16} />
            </span>
          ))}
        </span>
        <span aria-live="polite">{copied ? 'Prompt copied' : 'Copy prompt'}</span>
        {copied ? (
          <Check aria-hidden="true" className="ml-2 size-3.5 text-[var(--composio-brand)]" />
        ) : (
          <Copy
            aria-hidden="true"
            className="ml-2 size-3.5 text-fd-foreground/45 transition-colors group-hover:text-fd-foreground/70"
          />
        )}
      </button>
    </div>
  );
}
