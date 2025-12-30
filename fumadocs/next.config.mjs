import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/docs/welcome',
        permanent: false,
      },
      {
        source: '/docs',
        destination: '/docs/welcome',
        permanent: false,
      },
    ];
  },
};

export default withMDX(config);
