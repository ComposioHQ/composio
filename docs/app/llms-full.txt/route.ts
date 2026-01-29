import { getLLMText, source, examplesSource, referenceSource, toolkitsSource } from '@/lib/source';

export const revalidate = false;

// Generic page type that works for all sources
interface PageLike {
  url: string;
  slugs: string[];
  data: {
    title: string;
    description?: string;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTextForPages(pages: PageLike[]) {
  return Promise.all(
    pages.map(async (page) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await getLLMText(page as any);
      } catch {
        // Graceful fallback if getText fails
        return `# ${page.data.title} (${page.url})\n\n${page.data.description || ''}`;
      }
    })
  );
}

// Order pages according to sidebar structure from meta.json
function orderDocPages(pages: PageLike[]) {
  // Define the order based on meta.json sidebar structure
  const sidebarOrder = [
    // Get Started
    'index',
    'quickstart',
    // Providers folder
    'providers/openai-agents',
    'providers/anthropic',
    'providers/vercel',
    'providers/langchain',
    'providers/mastra',
    'providers/openai',
    'providers/google',
    'providers/llamaindex',
    'providers/crewai',
    'providers/custom-providers',
    // Core Concepts
    'users-and-sessions',
    'authentication',
    'tools-and-toolkits',
    // Getting Started
    'configuring-sessions',
    'authenticating-users/in-chat-authentication',
    'authenticating-users/manually-authenticating',
    // Toolkits folder (from docs/toolkits)
    'toolkits',
    // Guides
    'white-labeling-authentication',
    'managing-multiple-connected-accounts',
    'using-custom-auth-configuration',
    // Features
    'triggers',
    'cli',
    'single-toolkit-mcp',
    // Direct Tool Execution - Tools
    'tools-direct/fetching-tools',
    'tools-direct/authenticating-tools',
    'tools-direct/executing-tools',
    'tools-direct/modify-tool-behavior',
    'tools-direct/custom-tools',
    'tools-direct/toolkit-versioning',
    // Direct Tool Execution - Auth Configuration
    'auth-configuration',
    // Resources
    'debugging-info',
    'migration-guide',
    'troubleshooting',
  ];

  // Create a map for ordering
  const orderMap = new Map<string, number>();
  sidebarOrder.forEach((slug, index) => {
    orderMap.set(slug, index);
  });

  // Sort pages based on sidebar order, unmatched pages go to end
  return [...pages].sort((a, b) => {
    const slugA = a.slugs.join('/');
    const slugB = b.slugs.join('/');
    const orderA = orderMap.get(slugA) ?? 999;
    const orderB = orderMap.get(slugB) ?? 999;
    return orderA - orderB;
  });
}

export async function GET() {
  try {
    const orderedDocsPages = orderDocPages(source.getPages() as PageLike[]);

    const [docsResults, examplesResults, referenceResults, toolkitsResults] = await Promise.all([
      getTextForPages(orderedDocsPages),
      getTextForPages(examplesSource.getPages() as PageLike[]),
      getTextForPages(referenceSource.getPages() as PageLike[]),
      getTextForPages(toolkitsSource.getPages() as PageLike[]),
    ]);

    const results = [
      '# Composio Documentation\n\n> Composio powers 800+ toolkits, tool search, context management, authentication, and a sandboxed workbench to help you build AI agents that turn intent into action.\n\n# Documentation\n',
      ...docsResults,
      '\n# Examples\n',
      ...examplesResults,
      '\n# API Reference\n',
      ...referenceResults,
      '\n# Toolkits\n',
      ...toolkitsResults,
    ];

    return new Response(results.join('\n\n---\n\n'), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('[llms-full.txt] Error generating content:', error);
    return new Response('Error generating LLM content', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}
