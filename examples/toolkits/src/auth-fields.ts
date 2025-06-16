import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const toolkitSlug = 'shopify';

console.log('🔄 Getting auth config creation fields for toolkit: ', toolkitSlug);
const authConfigCreationFields = await composio.toolkits.getAuthConfigCreationFields(toolkitSlug);

console.log('✅ Auth config creation fields:');
console.log(authConfigCreationFields);

console.log('🔄 Getting connected account initiation fields for toolkit: ', toolkitSlug);
const connectedAccountInitiationFields =
  await composio.toolkits.getConnectedAccountInitiationFields(toolkitSlug);

console.log('✅ Connected account initiation fields:');
console.log(connectedAccountInitiationFields);
