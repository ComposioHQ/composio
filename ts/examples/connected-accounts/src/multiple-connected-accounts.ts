import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const connectionRequest = await composio.connectedAccounts.initiate('default', 'ac_NSC2s9WqTE4n', {
  allowMultiple: true,
});

console.log(connectionRequest.redirectUrl);
