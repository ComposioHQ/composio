import { Composio } from "@composio/core";

const composio = new Composio();
const linearAuthConfigId = "ac_1234";
const userId = "user@email.com";

// Initiate the OAuth connection request
const connRequest = await composio.connectedAccounts.initiate(userId, linearAuthConfigId);

const { redirectUrl, id } = connRequest;
console.log(redirectUrl);

// Wait for the connection to be established
await connRequest.waitForConnection();

// If you only have the connection request ID, you can also wait using:
await composio.connectedAccounts.waitForConnection(id);

