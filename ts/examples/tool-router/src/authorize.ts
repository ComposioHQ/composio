import { Composio } from '@composio/core';

const composio = new Composio();

const userId = process.env.COMPOSIO_EXAMPLES_USER_ID; // the user id from your database
if (!userId) {
  throw new Error('Set COMPOSIO_EXAMPLES_USER_ID');
}

const session = await composio.create(userId, { toolkits: ['gmail'] });
const connectionRequest = await session.authorize('gmail', {
  callbackUrl: 'https://google.com',
});

console.log(`Visit this URL to authorize: ${connectionRequest.redirectUrl}`);

const connectedAccount = await connectionRequest.waitForConnection();
// Print identifying fields only: the full object carries live OAuth credentials.
console.log(`Connected account ${connectedAccount.id} is ${connectedAccount.status}`);
