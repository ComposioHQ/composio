import { Composio } from '@composio/core';
import { VercelToolset } from '@composio/vercel';

/**
 * Non agentic toolset
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const userId = 'default';

const tools = composio.tools.get(userId, 'HACKERNEWS_GET_USER', {
  modifyToolSchema: (toolSlug, tool) => {
    return {
      ...tool,
      description: 'This is a modified description',
    };
  },
});

const vercelComposio = new Composio({
  toolset: new VercelToolset(),
});

const vercelTools = vercelComposio.tools.get('default', {}, {});
