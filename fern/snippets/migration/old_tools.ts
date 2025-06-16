import { OpenAIToolSet } from 'composio-core';

const toolset = new OpenAIToolSet();

const tools_1 = await toolset.getTools({ apps: ['GITHUB'] });
const tools_2 = await toolset.getTools({
  actions: ['GITHUB_GET_THE_AUTHENTICATED_USER', 'LINEAR_CREATE_LINEAR_ISSUE'],
});
