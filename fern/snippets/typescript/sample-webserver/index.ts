import { Hono } from 'hono';
import { Composio } from '@composio/core';
import OpenAI from 'openai';

const app = new Hono();

// reads COMPOSIO_API_KEY from the environment variables
// uses OpenAI by default
const composio = new Composio();

const openai = new OpenAI();

// this should be made once and stored in a database
// const authConfigId = (await composio.authConfigs.create('GMAIL')).id;
const authConfigId = 'ac_DUMMY';

app.post('/create-connection', async c => {
  const { userId } = await c.req.json();

  const connection = await composio.connectedAccounts.initiate(userId, authConfigId);

  return c.json({
    id: connection.id,
    // for the user to authorize the connection
    redirectUrl: connection.redirectUrl,
  });
});

app.post('/send-email', async c => {
  const { userId, feedback, overwrite_email } = await c.req.json();

  const tools = await composio.tools.get(userId, {
    toolkits: ['GMAIL'],
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'Send the composio team feedback about their product at feedback@composio.dev, parse the user feedback and send an email from their account, if they provide an email address, use that, otherwise sent it to feedback@composio.dev',
      },
      {
        role: 'user',
        content: `
        User feedback: ${feedback}
        Overwrite email: ${overwrite_email}
        `,
      },
    ],
    tools,
    tool_choice: 'auto',
  });

  const result = await composio.provider.handleToolCalls(userId, completion);

  return c.json({ completion, result });
});

export default app;
