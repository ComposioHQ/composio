import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
	plugins: [
		cloudflareTest({
			miniflare: {
				wrangler: { configPath: './wrangler.jsonc' },
			},
		}),
	],
});
