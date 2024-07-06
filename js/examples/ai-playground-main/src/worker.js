import { faker } from '@faker-js/faker';
import { Hono } from 'hono';
import ui from './ui.html';
import { CloudflareToolSet } from '../../../lib/frameworks/cloudflare';

const app = new Hono();

const config = {
  model: '@hf/nousresearch/hermes-2-pro-mistral-7b',
};

const toolset = new CloudflareToolSet({
  apiKey: 'gz9byycic0mhhk2plynqyb',
});

async function setupUserConnectionIfNotExists(entityId) {
  const entity = await toolset.client.getEntity(entityId);
  const connection = await entity.getConnection('github');

  if (!connection) {
    // If this entity/user hasn't already connected the account
    const connection = await entity.initiateConnection('github');
    console.log('Log in via: ', connection.redirectUrl);
    return connection.waitUntilActive(60);
  }

  return connection;
}

app.get('/', (c) => c.html(ui));

app.post('/', async (c) => {
  try {
    const { content } = await c.req.json();

    const entity = await toolset.client.getEntity('anon');
    await setupUserConnectionIfNotExists(entity.id);

    const tools = await toolset.get_actions({ actions: ['github_issues_create'] }, entity.id);
    console.log(tools);

    const instruction = 'Make an issue with sample title in the repo - anonthedev/break';

    let messages = [
      { role: 'system', content: 'You are a helpful assistant that I can talk with. Only call tools if I ask for them.' },
      { role: 'user', content: instruction },
    ];

    const toolCallResp = await c.env.AI.run(config.model, {
      messages,
      tools,
    });

    console.log(toolCallResp);

    if (toolCallResp.tool_calls) {
      const modifiedToolCalls = {
        response: null,
        tool_calls: [{ arguments: toolCallResp.tool_calls[0].arguments, name: 'github_issues_create' }],
      };
      // console.log(toolCallResp.tool_calls[0].arguments)
      const outputs = await toolset.handle_tool_call(modifiedToolCalls, entity.id);
      // console.log(outputs)
      // for (const tool_call of toolCallResp.tool_calls) {
      // const string = faker.string.alpha(10);
      // messages.push({
      //   role: 'system',
      //   content: `The random string is ${string}`,
      // });

      // let result = await c.env.AI.run(config.model, { messages });
      // messages.unshift();

      // messages.push({
      //   role: 'tool',
      //   tool: tool_call.name,
      //   result: string,
      // });

      // messages.push({
      //   role: 'assistant',
      //   content: result.response,
      // });
      // }
    } else {
      // No tools used, run "tool-less"
      // let result = await c.env.AI.run(config.model, {
      //   messages,
      // });
      // messages.push({ role: 'assistant', content: result.response });
    }

    const filteredMessages = messages.filter((m) => ['assistant', 'tool'].includes(m.role));

    console.log(filteredMessages);

    return c.json({ messages: filteredMessages });
  } catch (err) {
    console.log(err);
    return c.text('Something went wrong', 500);
  }
});

export default app;
