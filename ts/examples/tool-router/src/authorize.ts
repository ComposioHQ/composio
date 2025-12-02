import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

const composio = new Composio({
  provider: new VercelProvider(),
});
const session = await composio.experimental.create('user_123', { toolkits: ['gmail'] });
const connectionRequest = await session.authorize("gmail");

console.log(connectionRequest);

const connectedAccount = await connectionRequest.waitForConnection();
console.log(connectedAccount);


