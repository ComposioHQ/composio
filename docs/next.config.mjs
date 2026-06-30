import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMDX } from 'fumadocs-mdx/next';
import { withEve } from 'eve/next';

const __dirname = dirname(fileURLToPath(import.meta.url));
const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
    resolveAlias: {
      // eve/react pulls in a bundled rolldown helper with a bare, unused
      // `import "node:module"`. Turbopack can't keep that as an external in a
      // browser chunk, so stub it to an empty module on the browser.
      'node:module': { browser: './lib/eve-empty-module.js' },
    },
  },
  // The OpenAPI specs are loaded at request time via
  // `join(process.cwd(), 'public/openapi.json')` (see lib/openapi.ts). Because
  // that path is computed, Next.js' file tracer can't statically detect it, so
  // the JSON files are NOT bundled into the serverless functions that render
  // reference pages and their `/llms.mdx/reference/...` (.md) endpoints. Without
  // them present on disk, fumadocs-openapi throws
  // `[OpenAPI] Failed to resolve input` and the route 500s in production
  // (it works at build time only because `public/` exists at the project root).
  // Explicitly trace the specs into every route that may resolve them at runtime.
  outputFileTracingIncludes: {
    '/reference/**': ['./public/openapi.json', './public/openapi-v3.json'],
    '/reference/v3/**': ['./public/openapi.json', './public/openapi-v3.json'],
    '/llms.mdx/**': ['./public/openapi.json', './public/openapi-v3.json'],
    '/llms-full.txt/**': ['./public/openapi.json', './public/openapi-v3.json'],
    '/llms.txt/**': ['./public/openapi.json', './public/openapi-v3.json'],
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
      // === Docs v3 reorganization redirects (auto-generated: route moves vs pre-reorg) ===
      // Renamed/moved pages -> new location
      {
        source: '/docs/observability/logs',
        destination: '/reference/api-reference/logs',
        permanent: true,
      },
      {
        source: '/reference/sdk-reference/python/tool-router-session',
        destination: '/reference/sdk-reference/python/session',
        permanent: true,
      },
      {
        source: '/reference/sdk-reference/typescript/tool-router-session-files-mount',
        destination: '/reference/sdk-reference/typescript/session-files',
        permanent: true,
      },
      {
        source: '/reference/sdk-reference/typescript/tool-router-session',
        destination: '/reference/sdk-reference/typescript/session',
        permanent: true,
      },
      {
        source: '/toolkits/premium-tools',
        destination: '/toolkits/pro-tools',
        permanent: true,
      },
      // Deleted/merged pages -> closest surviving page (semantically resolved + verified)
      {
        source: '/docs/authenticating-users/in-chat-authentication',
        destination: '/docs/authentication',
        permanent: true,
      },
      {
        source: '/docs/common-faq',
        destination: '/docs',
        permanent: true,
      },
      {
        source: '/docs/debugging-info',
        destination: '/reference/errors',
        permanent: true,
      },
      {
        source: '/docs/glossary',
        destination: '/reference/glossary',
        permanent: true,
      },
      {
        source: '/docs/native-tools-vs-mcp',
        destination: '/docs/sessions-via-mcp',
        permanent: true,
      },
      {
        source: '/docs/observability',
        destination: '/reference/api-reference/logs',
        permanent: true,
      },
      {
        source: '/docs/observability/usage',
        destination: '/reference/api-reference/organization',
        permanent: true,
      },
      {
        source: '/docs/projects',
        destination: '/reference/api-reference/projects',
        permanent: true,
      },
      {
        source: '/docs/signing-up-as-an-agent',
        destination: '/docs/cli',
        permanent: true,
      },
      {
        source: '/docs/subscribing-to-connection-expiry-events',
        destination: '/docs/setting-up-triggers/subscribing-to-events',
        permanent: true,
      },
      {
        source: '/docs/toolkits/enable-and-disable-toolkits',
        destination: '/docs/configuring-sessions',
        permanent: true,
      },
      {
        source: '/docs/toolkits/fetching-tools-and-toolkits',
        destination: '/docs/configuring-sessions',
        permanent: true,
      },
      {
        source: '/docs/tools-and-toolkits',
        destination: '/docs/how-composio-works',
        permanent: true,
      },
      {
        source: '/docs/webhook-verification',
        destination: '/docs/setting-up-triggers/subscribing-to-events',
        permanent: true,
      },
      {
        source: '/reference/api-reference/authentication',
        destination: '/reference/authenticating-to-composio',
        permanent: true,
      },
      {
        source: '/reference/sdk-reference/python/session-context-impl',
        destination: '/reference/sdk-reference/python/session',
        permanent: true,
      },
      {
        source: '/reference/sdk-reference/typescript/session-context-impl',
        destination: '/reference/sdk-reference/typescript/session',
        permanent: true,
      },
      {
        source: '/reference/v3/api-reference/authentication',
        destination: '/reference/v3/authentication',
        permanent: true,
      },
      // === end docs v3 reorganization redirects ===
      {
        source: '/',
        destination: '/docs',
        permanent: false,
      },
      // Meta Tools moved from the Reference tab to the Toolkits tab.
      {
        source: '/reference/meta-tools',
        destination: '/toolkits/meta-tools',
        permanent: true,
      },
      {
        source: '/reference/meta-tools/:path*',
        destination: '/toolkits/meta-tools/:path*',
        permanent: true,
      },
      // Cookbooks were renamed to Examples; the old articles were removed,
      // so send every old /cookbooks URL to the Examples index.
      {
        source: '/cookbooks',
        destination: '/examples',
        permanent: true,
      },
      {
        source: '/cookbooks/:path*',
        destination: '/examples',
        permanent: true,
      },
      {
        source: '/docs/welcome',
        destination: '/docs',
        permanent: true,
      },
      // The workbench was renamed to the sandbox; keep old links working.
      {
        source: '/docs/workbench',
        destination: '/docs/sandbox/remote',
        permanent: true,
      },
      // The sandbox page became a section (remote + local); keep the old URL working.
      {
        source: '/docs/sandbox',
        destination: '/docs/sandbox/remote',
        permanent: true,
      },
      {
        source: '/docs/changelog',
        destination: '/reference/changelog',
        permanent: true,
      },
      {
        source: '/docs/changelog/:year/:month/:day',
        destination: '/reference/changelog#:year-:month-:day',
        permanent: true,
      },
      {
        source: '/reference/changelog/:year/:month/:day',
        destination: '/reference/changelog#:year-:month-:day',
        permanent: true,
      },
      {
        source: '/docs/changelog/:path*',
        destination: '/reference/changelog',
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
        destination: '/docs/how-composio-works',
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
        destination: '/docs/how-composio-works',
        permanent: true,
      },
      // Authentication pages moved from tool-router to docs
      {
        source: '/tool-router/using-in-chat-authentication',
        destination: '/docs/authentication#in-chat-authentication',
        permanent: true,
      },
      {
        source: '/tool-router/manually-authenticating-users',
        destination: '/docs/manually-authenticating',
        permanent: true,
      },
      {
        source: '/tool-router/using-custom-auth-configs',
        destination: '/docs/custom-app-vs-managed-app',
        permanent: true,
      },
      {
        source: '/docs/authenticating-users/using-custom-auth-configs',
        destination: '/docs/custom-app-vs-managed-app',
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
        source: '/providers/google-adk',
        destination: '/docs/providers/google',
        permanent: true,
      },
      {
        source: '/docs/providers/google-adk',
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
        destination: '/docs/providers/openai',
        permanent: true,
      },
      {
        source: '/providers/claude-agent-sdk',
        destination: '/docs/providers/anthropic',
        permanent: true,
      },
      {
        source: '/docs/providers/openai-agents',
        destination: '/docs/providers/openai',
        permanent: true,
      },
      {
        source: '/docs/providers/claude-agent-sdk',
        destination: '/docs/providers/anthropic',
        permanent: true,
      },
      {
        source: '/providers/langgraph',
        destination: '/docs/providers/langchain',
        permanent: true,
      },
      {
        source: '/docs/providers/langgraph',
        destination: '/docs/providers/langchain',
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
      // Programmatic auth configs consolidated into the Customizing auth section
      {
        source: '/docs/auth-configuration/programmatic-auth-configs',
        destination: '/docs/programmatic-auth-configs',
        permanent: true,
      },
      // Authenticating users folder flattened into the Authenticate users section
      {
        source: '/docs/authenticating-users/manually-authenticating',
        destination: '/docs/manually-authenticating',
        permanent: true,
      },
      {
        source: '/docs/authenticating-users/managing-multiple-connected-accounts',
        destination: '/docs/managing-multiple-connected-accounts',
        permanent: true,
      },
      {
        source: '/docs/authenticating-users/shared-connections',
        destination: '/docs/shared-connections',
        permanent: true,
      },
      // Authentication reference renamed to "Authenticating to Composio"
      {
        source: '/reference/authentication',
        destination: '/reference/authenticating-to-composio',
        permanent: true,
      },
      {
        source: '/reference/authentication/:path*',
        destination: '/reference/authenticating-to-composio/:path*',
        permanent: true,
      },
      // Features section redirects
      {
        source: '/docs/users-and-sessions',
        destination: '/docs/how-composio-works',
        permanent: true,
      },
      {
        source: '/docs/user-management',
        destination: '/docs/how-composio-works#users',
        permanent: true,
      },
            {
        source: '/docs/using-triggers',
        destination: '/docs/setting-up-triggers/creating-triggers',
        permanent: true,
      },
      {
        source: '/triggers',
        destination: '/docs/triggers',
        permanent: true,
      },
      {
        source: '/docs/how-tools-work',
        destination: '/docs/how-composio-works',
        permanent: true,
      },
      {
        source: '/features/authentication',
        destination: '/docs/authentication',
        permanent: true,
      },
      {
        source: '/features/triggers',
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
      // Custom tools and proxy execute moved under the Extending sessions section.
      {
        source: '/docs/custom-tools-and-toolkits',
        destination: '/docs/extending-sessions/custom-tools-and-toolkits',
        permanent: true,
      },
      {
        source: '/docs/toolkits/custom-tools-and-toolkits',
        destination: '/docs/extending-sessions/custom-tools-and-toolkits',
        permanent: true,
      },
      {
        source: '/docs/proxy-execute',
        destination: '/docs/extending-sessions/proxy-execute',
        permanent: true,
      },
      {
        source: '/docs/custom-tools',
        destination: '/docs/extending-sessions/custom-tools-and-toolkits',
        permanent: true,
      },
      {
        source: '/docs/tools-direct/custom-tools',
        destination: '/docs/extending-sessions/custom-tools-and-toolkits',
        permanent: true,
      },
      {
        source: '/docs/tools-direct/custom-tools/:path*',
        destination: '/docs/extending-sessions/custom-tools-and-toolkits',
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
        destination: '/docs/how-composio-works',
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
        destination: '/docs/extending-sessions/custom-tools-and-toolkits',
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
        destination: '/docs/how-composio-works',
        permanent: true,
      },
      {
        source: '/tool-calling/:path*',
        destination: '/docs/how-composio-works',
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
        destination: '/docs/how-composio-works',
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
      // Removed: /docs/providers now has its own index page
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
      // Old Fern example URLs (specific redirect moved above catch-all)
      // Old /docs/frameworks/* paths (now /docs/providers/*)
      // e.g. /docs/frameworks/claude-code → /docs/providers/anthropic
      {
        source: '/docs/frameworks/claude-code',
        destination: '/docs/providers/anthropic',
        permanent: true,
      },
      {
        source: '/docs/frameworks/claude',
        destination: '/docs/providers/anthropic',
        permanent: true,
      },
      {
        source: '/docs/frameworks/:path*',
        destination: '/docs/providers',
        permanent: true,
      },
      {
        source: '/frameworks/:path*',
        destination: '/docs/providers',
        permanent: true,
      },
      // Old /apps/* paths (now /toolkits/*)
      {
        source: '/apps',
        destination: '/toolkits',
        permanent: true,
      },
      {
        source: '/apps/usecases/:path*',
        destination: '/examples',
        permanent: true,
      },
      {
        source: '/apps/:path*',
        destination: '/toolkits/:path*',
        permanent: true,
      },
      // Tool router pages that still 404
      {
        source: '/tool-router/using-as-a-native-tool',
        destination: '/docs/quickstart',
        permanent: true,
      },
      {
        source: '/tool-router/using-with-mcp-clients',
        destination: '/docs/quickstart',
        permanent: true,
      },
      {
        source: '/tool-router/:path*',
        destination: '/docs/quickstart',
        permanent: true,
      },
      // Docs pages that moved (confirmed real 404s from Datadog)
      {
        source: '/docs/authenticating-users',
        destination: '/docs/tools-direct/authenticating-tools',
        permanent: true,
      },
      {
        source: '/docs/introduction/intro',
        destination: '/docs',
        permanent: true,
      },
      {
        source: '/docs/introduction/:path*',
        destination: '/docs',
        permanent: true,
      },
      {
        source: '/docs/tools/modify/:path*',
        destination: '/docs/tools-direct/modify-tool-behavior',
        permanent: true,
      },
      {
        source: '/docs/mcp-overview',
        destination: '/docs/single-toolkit-mcp',
        permanent: true,
      },
      {
        source: '/docs/what-is-mcp',
        destination: '/docs/single-toolkit-mcp',
        permanent: true,
      },
      {
        source: '/docs/mcp-authentication',
        destination: '/docs/authentication',
        permanent: true,
      },
      {
        source: '/docs/mcp-partner-api',
        destination: '/docs/single-toolkit-mcp',
        permanent: true,
      },
      {
        source: '/docs/migration-guide/overview',
        destination: '/docs/migration-guide',
        permanent: true,
      },
      {
        source: '/docs/modifiers/:path*',
        destination: '/docs/tools-direct/modify-tool-behavior',
        permanent: true,
      },
      {
        source: '/docs/toolkit-versions',
        destination: '/docs/tools-direct/toolkit-versioning',
        permanent: true,
      },
      {
        source: '/docs/guides/managing-multiple-connected-accounts',
        destination: '/docs/managing-multiple-connected-accounts',
        permanent: true,
      },
      {
        source: '/docs/guides/white-labeling-authentication',
        destination: '/docs/white-labeling-authentication',
        permanent: true,
      },
      {
        source: '/docs/using-custom-auth-configuration',
        destination: '/docs/custom-app-vs-managed-app',
        permanent: true,
      },
      {
        source: '/docs/guides/using-custom-auth-configuration',
        destination: '/docs/custom-app-vs-managed-app',
        permanent: true,
      },
      {
        source: '/docs/google-sheets',
        destination: '/toolkits/googlesheets',
        permanent: true,
      },
      {
        source: '/docs/asana',
        destination: '/toolkits/asana',
        permanent: true,
      },
      {
        source: '/docs/ai-sdk/:path*',
        destination: '/docs/providers/vercel',
        permanent: true,
      },
      {
        source: '/docs/tool-router/quick-start-deprecated',
        destination: '/docs/quickstart',
        permanent: true,
      },
      // Old concept/auth paths (v1 docs)
      {
        source: '/concepts/:path*',
        destination: '/docs',
        permanent: true,
      },
      {
        source: '/auth/:path*',
        destination: '/docs/authentication',
        permanent: true,
      },
      {
        source: '/cryptokit/:path*',
        destination: '/examples',
        permanent: true,
      },
      {
        source: '/browser-automation/:path*',
        destination: '/toolkits/browserless',
        permanent: true,
      },
      {
        source: '/model-providers/:path*',
        destination: '/docs/providers',
        permanent: true,
      },
      {
        source: '/providers',
        destination: '/docs/providers',
        permanent: true,
      },
      // Old versioned API paths (v1, v-1, v3, v-3)
      {
        source: '/reference/api-reference/v1/:path*',
        destination: '/reference/api-reference',
        permanent: true,
      },
      {
        source: '/reference/api-reference/v-1/:path*',
        destination: '/reference/api-reference',
        permanent: true,
      },
      // Old reference section paths
      {
        source: '/reference/introduction',
        destination: '/reference',
        permanent: true,
      },
      {
        source: '/reference/triggers',
        destination: '/reference/api-reference/triggers',
        permanent: true,
      },
      {
        source: '/reference/v-1/:path*',
        destination: '/reference/api-reference',
        permanent: true,
      },
      // Legacy /docs/white-labeling → sessions white-labeling page
      {
        source: '/docs/white-labeling',
        destination: '/docs/white-labeling-authentication',
        permanent: true,
      },
    ];
  },
};

// `withEve` mounts the Eve docs assistant (agent/) on same-origin /eve/v1/*
// routes and runs the agent alongside the Next.js app in one Vercel deploy.
// Requires Node 24+ (see package.json engines / .node-version).
export default withEve(withMDX(config));
