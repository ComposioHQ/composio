import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { config } from 'dotenv';

config();

export default defineConfig({
	plugins: [
		cloudflareTest({
			miniflare: {
				wrangler: { configPath: './wrangler.jsonc' },
				bindings: {
					COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY ?? 'test-key',
				},
			},
		}),
	],
});
