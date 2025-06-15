import { Composio } from '@composio/core';
import { OpenAI } from 'openai';


const userId = 'your@email.com';
const composio = new Composio();

// Schema modifier to delete the `page` argument from the `HACKERNEWS_GET_LATEST_POSTS` tool
const tools = await composio.tools.get(
  userId,
  {
    tools: ['HACKERNEWS_GET_LATEST_POSTS', 'HACKERNEWS_GET_USER'],
  },
  {
    modifyToolSchema: (toolSlug, _, toolSchema) => {
      if (toolSlug === 'HACKERNEWS_GET_LATEST_POSTS') {
        const { inputParameters } = toolSchema;
        if (inputParameters?.properties) {
          delete inputParameters.properties['page'];
        }
        inputParameters.required = ['size'];
      }
      return toolSchema;
    },
  }
);

console.log(JSON.stringify(tools, null, 2));

const openai = new OpenAI();

const messages = [
  {
    role: 'user',
    content: 'What are the latest posts on Hacker News?',
  },
];

const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages,
  tools,
  tool_choice: 'auto',
});

const { tool_calls } = response.choices[0].message;
console.log(tool_calls);

if (tool_calls) {
  const {
    function: { arguments: toolArgs },
  } = tool_calls[0];

  const result_1 = await composio.tools.execute(
    'HACKERNEWS_GET_LATEST_POSTS',
    {
      userId,
      arguments: JSON.parse(toolArgs),
    },
    {
      beforeExecute: (toolSlug, _, params) => {
        if (toolSlug === 'HACKERNEWS_GET_LATEST_POSTS') {
          params.arguments.size = 1;
        }
        console.log(params);
        return params;
      },
    }
  );
  const result_2 = await composio.tools.execute(
    "HACKERNEWS_GET_USER",
    {
      userId,
      arguments: JSON.parse(toolArgs),
    },
    {
      afterToolExecute: (toolSlug, _, result) => {
        if (toolSlug === "HACKERNEWS_GET_USER") {
          const { data } = result;
          const { karma } = data.response_data as { karma: number };
          return {
            ...result,
            data: { karma },
          };
        }
        return result;
      },
    }
  );

  console.log(JSON.stringify(result, null, 2));
}
