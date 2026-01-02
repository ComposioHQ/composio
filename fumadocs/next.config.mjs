import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
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
        source: '/tool-router/overview',
        destination: '/tool-router',
        permanent: true,
      },
      // Provider redirects (old fern URLs -> new fumadocs URLs)
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
    ];
  },
};

export default withMDX(config);
