import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

const AGENTS = [
  {
    name: 'Claude Code',
    icon: '/images/clients/claude.svg',
    href: '/docs/agent-setup/clients#claude-code',
    description: 'Install the skill in your project, or use the native Composio plugin for direct app actions.',
  },
  {
    name: 'OpenAI Codex',
    icon: '/images/clients/codex.png',
    href: '/docs/agent-setup/clients#openai-codex',
    description: 'Install the skill in your project, or add the native Codex plugin for direct app actions.',
  },
  {
    name: 'Cursor',
    icon: '/images/clients/cursor.svg',
    href: '/docs/agent-setup/clients#cursor',
    description: 'Add the skill to your project so Cursor can build and configure Composio integrations.',
  },
  {
    name: 'GitHub Copilot',
    icon: '/images/clients/vscode.svg',
    href: '/docs/agent-setup/clients#github-copilot',
    description: 'Give Copilot agent mode the Composio guidance it needs inside your repository.',
  },
  {
    name: 'Gemini CLI',
    icon: '/images/clients/gemini.svg',
    href: '/docs/agent-setup/clients#gemini-cli',
    description: 'Install the skill from your project directory before asking Gemini to add Composio.',
  },
  {
    name: 'OpenClaw',
    icon: '/images/clients/openclaw.svg',
    href: '/docs/agent-setup/clients#openclaw',
    description: 'Install the skill for build guidance, or connect Composio for personal app access.',
  },
  {
    name: 'OpenCode',
    icon: '/images/clients/opencode.svg',
    href: '/docs/agent-setup/clients#opencode',
    description: 'Install the skill in your project so OpenCode can build and configure Composio integrations.',
  },
  {
    name: 'Cline',
    icon: '/images/clients/cline.svg',
    href: '/docs/agent-setup/clients#cline',
    description: 'Add the skill to your repository so Cline can follow the current Composio integration path.',
  },
  {
    name: 'Grok Build',
    icon: '/images/clients/grok.svg',
    href: '/docs/agent-setup/clients#grok-build',
    description: 'Install the skill for Grok Build to add Composio and make your first tool call.',
  },
] as const;

export function AgentSetupGrid() {
  return (
    <section className="not-prose my-8">
      <h2 className="mb-4 text-xl font-medium tracking-[-0.01em] text-fd-foreground sm:text-2xl">
        Pick your agent
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map(agent => (
          <Link
            className="group relative rounded-[14px] border border-fd-border bg-fd-card p-4 no-underline shadow-[0_1px_0_rgba(15,15,15,0.04)] transition-[border-color,transform,box-shadow] hover:-translate-y-px hover:border-fd-foreground/20 hover:shadow-[0_8px_20px_-12px_rgba(15,15,15,0.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
            href={agent.href}
            key={agent.name}
          >
            <ArrowUpRight
              aria-hidden="true"
              className="absolute right-4 top-4 size-3.5 text-fd-foreground/40 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
            />
            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-[7px] border border-fd-border bg-fd-background">
                <Image
                  alt=""
                  className={
                    agent.name === 'Grok Build' ? 'size-4 object-contain dark:invert' : 'size-4 object-contain'
                  }
                  height={16}
                  src={agent.icon}
                  width={16}
                />
              </span>
              <h3 className="text-[14px] font-medium text-fd-foreground">{agent.name}</h3>
            </div>
            <p className="text-[12.5px] leading-[1.55] text-fd-foreground/65">
              {agent.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
