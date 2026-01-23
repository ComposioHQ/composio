import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMDX } from 'fumadocs-mdx/next';

const __dirname = dirname(fileURLToPath(import.meta.url));
const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      // Serve markdown for AI agents: /any/path.md → /llms.mdx/any/path
      { source: '/:path*.md', destination: '/llms.mdx/:path*' },
      { source: '/:path*.mdx', destination: '/llms.mdx/:path*' },
    ];
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/docs',
        permanent: false,
      },
      {
        source: '/docs/welcome',
        destination: '/docs',
        permanent: true,
      },
      {
        source: '/tool-router',
        destination: '/docs/quickstart',
        permanent: true,
      },
      {
        source: '/tool-router/overview',
        destination: '/docs/quickstart',
        permanent: true,
      },
      {
        source: '/tool-router/quickstart',
        destination: '/docs/quickstart-tool-router',
        permanent: true,
      },
      // Core concepts moved from tool-router to docs
      {
        source: '/tool-router/users-and-sessions',
        destination: '/docs/users-and-sessions',
        permanent: true,
      },
      {
        source: '/tool-router/migration-guide',
        destination: '/docs/migration-guide/tool-router-beta',
        permanent: true,
      },
      {
        source: '/tool-router/migration-guide/beta-to-stable',
        destination: '/docs/migration-guide/tool-router-beta',
        permanent: true,
      },
      {
        source: '/tool-router/authentication',
        destination: '/docs/authentication',
        permanent: true,
      },
      {
        source: '/tool-router/tools-and-toolkits',
        destination: '/docs/tools-and-toolkits',
        permanent: true,
      },
      // Authentication pages moved from tool-router to docs
      {
        source: '/tool-router/using-in-chat-authentication',
        destination: '/docs/authenticating-users/in-chat-authentication',
        permanent: true,
      },
      {
        source: '/tool-router/manually-authenticating-users',
        destination: '/docs/authenticating-users/manually-authenticating',
        permanent: true,
      },
      {
        source: '/tool-router/using-custom-auth-configs',
        destination: '/docs/guides/using-custom-auth-configuration',
        permanent: true,
      },
      {
        source: '/docs/authenticating-users/using-custom-auth-configs',
        destination: '/docs/guides/using-custom-auth-configuration',
        permanent: true,
      },
      {
        source: '/tool-router/white-labeling-authentication',
        destination: '/docs/guides/white-labeling-authentication',
        permanent: true,
      },
      {
        source: '/tool-router/managing-multiple-accounts',
        destination: '/docs/guides/managing-multiple-connected-accounts',
        permanent: true,
      },
      // Provider redirects (old fern URLs -> new docs URLs)
      {
        source: '/providers/openai',
        destination: '/docs/providers/openai',
        permanent: true,
      },
      {
        source: '/providers/anthropic',
        destination: '/docs/providers/anthropic',
        permanent: true,
      },
      {
        source: '/providers/google',
        destination: '/docs/providers/google',
        permanent: true,
      },
      {
        source: '/providers/langchain',
        destination: '/docs/providers/langchain',
        permanent: true,
      },
      {
        source: '/providers/llamaindex',
        destination: '/docs/providers/llamaindex',
        permanent: true,
      },
      {
        source: '/providers/crewai',
        destination: '/docs/providers/crewai',
        permanent: true,
      },
      {
        source: '/providers/vercel',
        destination: '/docs/providers/vercel',
        permanent: true,
      },
      {
        source: '/providers/openai-agents',
        destination: '/docs/providers/openai-agents',
        permanent: true,
      },
      {
        source: '/providers/mastra',
        destination: '/docs/providers/mastra',
        permanent: true,
      },
      {
        source: '/providers/custom/typescript',
        destination: '/docs/providers/custom-providers/typescript',
        permanent: true,
      },
      {
        source: '/providers/custom/python',
        destination: '/docs/providers/custom-providers/python',
        permanent: true,
      },
      // API reference redirects
      {
        source: '/api-reference',
        destination: '/reference',
        permanent: true,
      },
      {
        source: '/api-reference/:path*',
        destination: '/reference/:path*',
        permanent: true,
      },
      {
        source: '/rest-api/:path*',
        destination: '/reference/api-reference/:path*',
        permanent: true,
      },
      // Features section redirects
      {
        source: '/docs/using-triggers',
        destination: '/docs/triggers',
        permanent: true,
      },
      {
        source: '/docs/mcp-quickstart',
        destination: '/docs/mcp/mcp-quickstart',
        permanent: true,
      },
      {
        source: '/docs/mcp-server-management',
        destination: '/docs/mcp/mcp-server-management',
        permanent: true,
      },
    ];
  },
};

export default withMDX(config);
