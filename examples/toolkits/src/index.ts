import { Composio } from '@composio/core';

const composio = new Composio();

const toolkit = await composio.tools.get('default', 'INvalid tool');
// const client = composio.getClient();
