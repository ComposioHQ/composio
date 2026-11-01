import { Composio } from '@composio/core';
import 'dotenv/config';

export const tool = 'HACKERNEWS_GET_USER';
export const approvalTools = [tool, 'HACKERNEWS_GET_MAX_ITEM_ID'];
export const toolArguments = { username: 'pg' };
export const multiArguments = {
  tools: [
    { tool_slug: tool, arguments: toolArguments },
    { tool_slug: 'HACKERNEWS_GET_MAX_ITEM_ID', arguments: {} },
  ],
  sync_response_to_workbench: false,
};

export function createComposio() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error('Set COMPOSIO_API_KEY before running this example');
  return new Composio({ apiKey, baseURL: process.env.COMPOSIO_BASE_URL });
}

export async function createApprovalSession(composio: Composio) {
  return composio.create(`approvals-example-${crypto.randomUUID()}`, {
    toolkits: ['hackernews'],
    tools: { hackernews: { enable: approvalTools, requireApproval: approvalTools } },
    sandbox: { enable: false },
  });
}
