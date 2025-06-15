import { Composio } from '@composio/core';

const composio = new Composio();

const authConfig = await composio.authConfigs.create('LINEAR', {
  name: 'Linear',
  type: 'use_composio_managed_auth',
  //   type: "use_custom_auth",
  //   credentials: {
  //     client_id: "1234567890",
  //     client_secret: "1234567890",
  //     oauth_redirect_uri: "https://backend.composio.dev/api/v3/toolkits/callback",
  // },
});

console.log(authConfig);
