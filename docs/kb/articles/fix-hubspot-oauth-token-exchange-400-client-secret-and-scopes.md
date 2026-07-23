For a 400 during a **customer-owned HubSpot OAuth** token exchange, first inspect HubSpot's error, then verify the current client secret, redirect URI, and required-versus-optional scope configuration before reconnecting. A 400 is not proof that any one of these is the cause.

## Before you retry

This applies to a custom HubSpot OAuth app configured in Composio. Confirm that you are editing the same app whose client ID is in the auth config; do not change the default scope set of a managed configuration.

## Recover the connection

1. Copy the current client secret from the HubSpot app and update the matching Composio auth config. A rotated secret or a secret from another app will fail token exchange.
2. Confirm the app's redirect URI and its required scopes. Required scopes must be included in the OAuth request.
3. Request optional scopes as optional, then inspect the granted token scopes before depending on an optional capability.
4. Start a new connection after correcting the configuration.

Use [Composio authentication](/docs/authentication) for the connection flow and HubSpot's [OAuth token documentation](https://developers.hubspot.com/docs/api-reference/latest/authentication/manage-oauth-tokens) for the provider's current credential and scope rules.
