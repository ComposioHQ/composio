import { Composio } from '@composio/core';

const composio = new Composio();

const tools_1 = await composio.tools.getRawComposioToolBySlug('user@acme.org', 'GITHUB_CREATE_AN_ISSUE');
console.log(tools_1);

const tools_2 = await composio.tools.getRawComposioTools('user@acme.org', {
  toolkits: ['SLACK'],
});
console.log(tools_2);
