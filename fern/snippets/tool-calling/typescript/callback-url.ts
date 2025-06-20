import { Composio } from '@composio/core';
import { v4 as uuidv4 } from 'uuid';

const composio = new Composio();
const linearAuthConfigId = 'ac_dqYN9oElNVlg';

const userId = uuidv4();

// Initiate the OAuth connection request
const connRequest = await composio.connectedAccounts.initiate(
  userId,
  linearAuthConfigId,
  {
    callbackUrl: 'https://www.yourapp.com/callback',
  }
);

console.log(connRequest.redirectUrl);

await connRequest.waitForConnection();
