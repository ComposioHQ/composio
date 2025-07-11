import { Composio } from '@composio/core';

const composio = new Composio();

const toolkits = await composio.toolkits.get({});

console.log(JSON.stringify(toolkits, null, 2));
