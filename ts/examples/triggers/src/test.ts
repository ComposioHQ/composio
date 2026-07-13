import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const session = await composio.create('userId', {
  experimental: {
    assistivePrompt: {
      userTimezone: 'America/New_York',
    }
  }
})

const prompt = session.experimental?.assistivePrompt;

console.log({ prompt })