import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config();

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY ?? 'test-key',
          COMPOSIO_BASE_URL: process.env.COMPOSIO_BASE_URL ?? 'https://backend.composio.dev',
        },
      },
    }),
  ],
});
