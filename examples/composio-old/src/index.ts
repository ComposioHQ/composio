import { OpenAIToolSet } from 'composio-core';

const composio = new OpenAIToolSet({
  apiKey: process.env.COMPOSIO_API_KEY,
  connectedAccountIds: {
    slack: '123',
  },
  entityId: '123',
});

const tools = composio.getTools({});

const toolManager = composio.createToolManager({
  userId: '123',
  connectedAccountIds: ['123'],
});
