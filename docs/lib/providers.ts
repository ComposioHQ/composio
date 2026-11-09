export interface Provider {
  name: string;
  href: string;
  languages: readonly ('Python' | 'TypeScript')[];
  logo?: string;
  logoDark?: string;
  experimental?: boolean;
}

/** Guide-backed inventory shared by HTML, Markdown, and discovery. */
export const PROVIDERS: Record<'ai-sdks' | 'agent-frameworks' | 'custom', readonly Provider[]> = {
  'ai-sdks': [
    {
      name: 'Anthropic', href: '/docs/providers/anthropic',
      logo: '/images/providers/anthropic-logo.svg', logoDark: '/images/providers/anthropic-logo-dark.svg',
      languages: ['Python', 'TypeScript'],
    },
    {
      name: 'OpenAI', href: '/docs/providers/openai',
      logo: '/images/providers/openai-logo.svg', logoDark: '/images/providers/openai-logo-dark.svg',
      languages: ['Python', 'TypeScript'],
    },
    {
      name: 'Vercel AI SDK', href: '/docs/providers/vercel',
      logo: '/images/providers/vercel-logo.svg', logoDark: '/images/providers/vercel-logo-dark.svg',
      languages: ['TypeScript'],
    },
    {
      name: 'Google', href: '/docs/providers/google',
      logo: '/images/providers/google-logo.svg', languages: ['Python', 'TypeScript'],
    },
    { name: 'TypeSafe', href: '/docs/providers/typesafe', languages: ['Python', 'TypeScript'] },
    {
      name: 'Cloudflare Workers AI',
      href: 'https://github.com/ComposioHQ/composio/blob/next/ts/packages/providers/cloudflare/README.md',
      languages: ['TypeScript'],
    },
  ],
  'agent-frameworks': [
    { name: 'OpenAI Agents SDK', href: '/docs/providers/openai', languages: ['Python', 'TypeScript'] },
    { name: 'Claude Agent SDK', href: '/docs/providers/anthropic', languages: ['Python', 'TypeScript'] },
    { name: 'Google ADK', href: '/docs/providers/google', languages: ['Python'] },
    {
      name: 'LangChain', href: '/docs/providers/langchain',
      logo: '/images/providers/langchain-logo.svg', logoDark: '/images/providers/langchain-logo-dark.svg',
      languages: ['Python', 'TypeScript'],
    },
    { name: 'LangGraph', href: '/docs/providers/langchain', languages: ['Python'] },
    {
      name: 'CrewAI', href: '/docs/providers/crewai',
      logo: '/images/providers/crewai-logo.svg', languages: ['Python'],
    },
    {
      name: 'LlamaIndex', href: '/docs/providers/llamaindex',
      logo: '/images/providers/llamaIndex-logo.svg', languages: ['Python', 'TypeScript'],
    },
    {
      name: 'Mastra', href: '/docs/providers/mastra',
      logo: '/images/providers/mastra-logo.svg', logoDark: '/images/providers/mastra-logo-dark.svg',
      languages: ['TypeScript'],
    },
    {
      name: 'Pi', href: '/docs/providers/pi',
      logo: '/images/providers/pi-logo.svg', logoDark: '/images/providers/pi-logo-dark.svg',
      languages: ['TypeScript'], experimental: true,
    },
    { name: 'Eve', href: '/docs/providers/eve', languages: ['TypeScript'], experimental: true },
    { name: 'AutoGen', href: '/docs/providers/autogen', languages: ['Python'] },
  ],
  custom: [
    { name: 'Build your own', href: '/docs/providers/custom-providers', languages: ['Python', 'TypeScript'] },
  ],
};

export type ProviderGroup = keyof typeof PROVIDERS;

export function providerListMarkdown(group: ProviderGroup): string {
  return PROVIDERS[group].map(provider =>
    `- [${provider.name}](${provider.href}) (${provider.languages.join(', ')}${provider.experimental ? '; experimental' : ''})`,
  ).join('\n');
}
