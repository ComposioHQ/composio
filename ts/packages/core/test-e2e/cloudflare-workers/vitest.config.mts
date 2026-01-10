import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { config } from 'dotenv';

config();

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					bindings: {
						COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY!,
					},
				},
			},
		},
	},
});
