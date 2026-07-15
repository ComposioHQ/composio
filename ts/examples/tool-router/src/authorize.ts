import { Composio } from '@composio/core';

const composio = new Composio();
const session = await composio.create('user_123', { toolkits: ['gmail'] });
const connectionRequest = await session.authorize("gmail", {
  callbackUrl: "https://google.com"
});

console.log(connectionRequest);

const connectedAccount = await connectionRequest.waitForConnection();
console.log(connectedAccount);


