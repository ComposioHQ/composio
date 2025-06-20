import { Composio } from '@composio/core';

const composio = new Composio();

const tool = await composio.tools.getRawComposioToolBySlug('GITHUB_GET_OCTOCAT');

console.log(JSON.stringify(tool, null, 2));
