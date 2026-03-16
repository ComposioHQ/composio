'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';

export type Framework =
  | 'openai-agents'
  | 'claude-agents'
  | 'langchain'
  | 'vercel-ai';

interface FrameworkOption {
  id: Framework;
  name: string;
  logo: string;
  logoDark?: string;
}

const frameworks: FrameworkOption[] = [
  {
    id: 'openai-agents',
    name: 'OpenAI Agents',
    logo: '/images/providers/openai-logo.svg',
    logoDark: '/images/providers/openai-logo-dark.svg',
  },
  {
    id: 'claude-agents',
    name: 'Claude Agents',
    logo: '/images/providers/anthropic-logo.svg',
    logoDark: '/images/providers/anthropic-logo-dark.svg',
  },
  {
    id: 'langchain',
    name: 'LangChain',
    logo: '/images/providers/langchain-logo.svg',
    logoDark: '/images/providers/langchain-logo-dark.svg',
  },
  {
    id: 'vercel-ai',
    name: 'Vercel AI SDK',
    logo: '/images/providers/vercel-logo.svg',
    logoDark: '/images/providers/vercel-logo-dark.svg',
  },
];

interface FrameworkCardProps {
  framework: FrameworkOption;
  selected: boolean;
  onSelect: () => void;
}

function FrameworkCard({ framework, selected, onSelect }: FrameworkCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        flex flex-col items-start gap-4 rounded-xl border-2 p-5 text-left transition-all
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2
        ${selected
          ? 'border-[var(--composio-orange)] bg-fd-card'
          : 'border-fd-border bg-fd-card hover:bg-fd-accent/50'
        }
      `}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center">
        {framework.logoDark ? (
          <>
            <Image
              src={framework.logo}
              alt={`${framework.name} logo`}
              width={40}
              height={40}
              className="h-8 w-auto dark:hidden"
            />
            <Image
              src={framework.logoDark}
              alt={`${framework.name} logo`}
              width={40}
              height={40}
              className="h-8 w-auto hidden dark:block"
            />
          </>
        ) : (
          <Image
            src={framework.logo}
            alt={`${framework.name} logo`}
            width={40}
            height={40}
            className="h-8 w-auto"
          />
        )}
      </div>

      <span className="text-sm font-medium text-fd-foreground">
        {framework.name}
      </span>
    </button>
  );
}

interface FrameworkSelectorProps {
  value?: Framework;
  onChange?: (framework: Framework) => void;
}

export function FrameworkSelector({ value = 'openai-agents', onChange }: FrameworkSelectorProps) {
  const [selected, setSelected] = useState<Framework>(value);

  // Sync internal state with prop changes
  useEffect(() => {
    setSelected(value);
  }, [value]);

  const handleSelect = (framework: Framework) => {
    setSelected(framework);
    onChange?.(framework);
  };

  return (
    <div className="not-prose">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {frameworks.map((framework) => (
          <FrameworkCard
            key={framework.id}
            framework={framework}
            selected={selected === framework.id}
            onSelect={() => handleSelect(framework.id)}
          />
        ))}
      </div>
    </div>
  );
}

export { frameworks };
