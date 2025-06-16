import { Composio } from '@composio/core';

const composio = new Composio();

const response = await composio.authConfigs.get('ac_3COrKCdQYLNu');

console.log(JSON.stringify(response, null, 2));
