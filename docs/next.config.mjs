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
  images: {
    // Enable modern image formats for better compression
    formats: ['image/avif', 'image/webp'],
    // Responsive breakpoints for srcset generation
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
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
        source: '/getting-started/welcome',
        destination: '/docs',
        permanent: true,
      },
      {
        source: '/getting-started/:path*',
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
        destination: '/docs/quickstart',
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
        destination: '/docs/using-custom-auth-configuration',
        permanent: true,
      },
      {
        source: '/docs/authenticating-users/using-custom-auth-configs',
        destination: '/docs/using-custom-auth-configuration',
        permanent: true,
      },
      {
        source: '/tool-router/white-labeling-authentication',
        destination: '/docs/white-labeling-authentication',
        permanent: true,
      },
      {
        source: '/tool-router/managing-multiple-accounts',
        destination: '/docs/managing-multiple-connected-accounts',
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
      // Old Fern API endpoint URLs with kebab-case operationIds
      // e.g. /api-reference/tools/post-tools-execute-by-tool-slug
      // proxy.ts handles kebab-to-camelCase conversion
      {
        source: '/api-reference/:tag/:operationId',
        destination: '/reference/api-reference/:tag/:operationId',
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
        source: '/docs/user-management',
        destination: '/docs/users-and-sessions#users',
        permanent: true,
      },
            {
        source: '/docs/using-triggers',
        destination: '/docs/triggers',
        permanent: true,
      },
      {
        source: '/docs/mcp-quickstart',
        destination: '/docs/single-toolkit-mcp',
        permanent: true,
      },
      {
        source: '/docs/mcp-server-management',
        destination: '/docs/single-toolkit-mcp',
        permanent: true,
      },
      {
        source: '/docs/mcp/:path*',
        destination: '/docs/single-toolkit-mcp',
        permanent: true,
      },
      // Tools section moved to tools-direct folder
      {
        source: '/docs/fetching-tools',
        destination: '/docs/tools-direct/fetching-tools',
        permanent: true,
      },
      {
        source: '/docs/authenticating-tools',
        destination: '/docs/tools-direct/authenticating-tools',
        permanent: true,
      },
      {
        source: '/docs/executing-tools',
        destination: '/docs/tools-direct/executing-tools',
        permanent: true,
      },
      {
        source: '/docs/modify-tool-behavior/:path*',
        destination: '/docs/tools-direct/modify-tool-behavior/:path*',
        permanent: true,
      },
      {
        source: '/docs/custom-tools',
        destination: '/docs/tools-direct/custom-tools',
        permanent: true,
      },
      {
        source: '/docs/toolkit-versioning',
        destination: '/docs/tools-direct/toolkit-versioning',
        permanent: true,
      },
      // Authentication section moved to auth-configuration folder
      {
        source: '/docs/custom-auth-configs',
        destination: '/docs/auth-configuration/custom-auth-configs',
        permanent: true,
      },
      {
        source: '/docs/programmatic-auth-configs',
        destination: '/docs/auth-configuration/programmatic-auth-configs',
        permanent: true,
      },
      {
        source: '/docs/custom-auth-params',
        destination: '/docs/auth-configuration/custom-auth-params',
        permanent: true,
      },
      {
        source: '/docs/connected-accounts',
        destination: '/docs/auth-configuration/connected-accounts',
        permanent: true,
      },
      // /tools → /toolkits
      {
        source: '/tools',
        destination: '/toolkits',
        permanent: true,
      },
      // /tools/* → /toolkits/*
      {
        source: '/tools/:path*',
        destination: '/toolkits/:path*',
        permanent: true,
      },
      // Old Fern documentation URLs
      {
        source: '/introduction/foundations/components/triggers/trigger-guide',
        destination: '/docs/triggers',
        permanent: true,
      },
      {
        source: '/toolkits/introduction',
        destination: '/docs/tools-and-toolkits',
        permanent: true,
      },
      {
        source: '/apps/usecases/crewai/:path*',
        destination: '/docs/providers/crewai',
        permanent: true,
      },
      {
        source: '/js-sdk/tools/execute',
        destination: '/docs/tools-direct/executing-tools',
        permanent: true,
      },
      {
        source: '/frameworks/others/:path*',
        destination: '/docs/providers',
        permanent: true,
      },
      {
        source: '/guides/examples/:path*',
        destination: '/examples',
        permanent: true,
      },
      {
        source: '/custom-tools/:path*',
        destination: '/docs/tools-direct/custom-tools',
        permanent: true,
      },
      // Error handling redirect (old fern URL)
      {
        source: '/errors/error-handling',
        destination: '/reference/errors',
        permanent: true,
      },
      // Old Fern introduction/overview pages
      {
        source: '/introduction/intro/overview',
        destination: '/docs',
        permanent: true,
      },
      {
        source: '/introduction/intro/quickstart-tools',
        destination: '/docs/quickstart',
        permanent: true,
      },
      {
        source: '/introduction/:path*',
        destination: '/docs',
        permanent: true,
      },
      // Old tool-calling section
      {
        source: '/tool-calling/processing-tools',
        destination: '/docs/tools-direct/executing-tools',
        permanent: true,
      },
      {
        source: '/tool-calling/introduction',
        destination: '/docs/tools-and-toolkits',
        permanent: true,
      },
      {
        source: '/tool-calling/:path*',
        destination: '/docs/tools-and-toolkits',
        permanent: true,
      },
      // Old framework pages
      {
        source: '/framework/crewai',
        destination: '/docs/providers/crewai',
        permanent: true,
      },
      {
        source: '/framework/autogen',
        destination: '/docs/providers',
        permanent: true,
      },
      {
        source: '/framework/:path*',
        destination: '/docs/providers',
        permanent: true,
      },
      // Old SDK reference pages
      {
        source: '/python-sdk-reference',
        destination: '/reference',
        permanent: true,
      },
      {
        source: '/python/introduction',
        destination: '/docs',
        permanent: true,
      },
      {
        source: '/python/:path*',
        destination: '/docs',
        permanent: true,
      },
      // Authentication (bare path without /docs prefix)
      {
        source: '/authentication',
        destination: '/docs/authentication',
        permanent: true,
      },
      // Changelog (bare path without /docs prefix)
      {
        source: '/changelog/api-v-3-migration',
        destination: '/docs/changelog',
        permanent: true,
      },
      {
        source: '/changelog',
        destination: '/docs/changelog',
        permanent: true,
      },
      {
        source: '/changelog/:path*',
        destination: '/docs/changelog',
        permanent: true,
      },
      // MCP pages
      {
        source: '/mcp/overview',
        destination: '/docs/single-toolkit-mcp',
        permanent: true,
      },
      {
        source: '/mcp/:path*',
        destination: '/docs/single-toolkit-mcp',
        permanent: true,
      },
      {
        source: '/docs/mcp-providers',
        destination: '/docs/single-toolkit-mcp',
        permanent: true,
      },
      // Patterns section (old Fern)
      {
        source: '/patterns/triggers/webhooks',
        destination: '/docs/triggers',
        permanent: true,
      },
      {
        source: '/patterns/:path*',
        destination: '/docs',
        permanent: true,
      },
      // Guides case studies
      {
        source: '/guides/casestudy/:path*',
        destination: '/examples',
        permanent: true,
      },
      // Docs pages that moved or don't exist
      {
        source: '/docs/resources/:path*',
        destination: '/docs',
        permanent: true,
      },
      {
        source: '/docs/migration',
        destination: '/docs/migration-guide/tool-router-beta',
        permanent: true,
      },
      {
        source: '/docs/tools',
        destination: '/docs/tools-and-toolkits',
        permanent: true,
      },
      {
        source: '/docs/tool-router/quick-start',
        destination: '/docs/quickstart',
        permanent: true,
      },
      {
        source: '/docs/managed-authentication',
        destination: '/docs/authentication',
        permanent: true,
      },
      {
        source: '/docs/dev-setup',
        destination: '/docs/quickstart',
        permanent: true,
      },
      {
        source: '/docs/providers',
        destination: '/docs/tools-and-toolkits',
        permanent: true,
      },
      {
        source: '/docs/providers/custom-providers/my-ai-provider',
        destination: '/docs/providers/custom-providers/typescript',
        permanent: true,
      },
      // Old Fern v-3 paths (different hyphenation)
      {
        source: '/reference/v-3/:path*',
        destination: '/reference',
        permanent: true,
      },
      // Old Fern SDK reference URLs (no content exists at these paths)
      {
        source: '/type-script/:path*',
        destination: '/reference',
        permanent: true,
      },
      {
        source: '/sdk-reference/:path*',
        destination: '/reference',
        permanent: true,
      },
      {
        source: '/sdk/:path*',
        destination: '/reference',
        permanent: true,
      },
      {
        source: '/js-sdk/:path*',
        destination: '/reference',
        permanent: true,
      },
      {
        source: '/js/:path*',
        destination: '/reference',
        permanent: true,
      },
      // Old Fern example URLs
      {
        source: '/examples/combined/:path*',
        destination: '/examples',
        permanent: true,
      },
    ];
  },
};

export default withMDX(config);
