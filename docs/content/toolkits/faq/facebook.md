## How do I set up custom OAuth credentials for Meta (Facebook)?


For a step-by-step guide on creating and configuring your own Meta (Facebook) OAuth credentials with Composio, see [How to create OAuth credentials for Meta (Facebook)](https://composio.dev/auth/facebook).

## Meta OAuth issues can require adding the Composio redirect URI in the Meta app settings


For Meta/Facebook OAuth failures, verify that the Composio redirect URI is added to the correct redirect URI field in the Meta developer app settings. If the app is using custom credentials, the redirect URI in Meta must match the Composio callback URI used by that auth config. After adding it, retry the connection flow.

## Why can API-key Meta Ads connections show ACTIVE before credential validation?


For API-key auth modes, Composio may mark a connection `ACTIVE` once the required fields are present. The Meta Ads token may still fail later when a tool call runs. If the API/SDK supports it, pass `validate_credentials=true` while initiating the connection to run Meta Ads credential verification; invalid credentials then return `CredentialsValidationFailed` instead of creating an apparently active connection.

## Meta Ads does not have a managed OAuth app; use your own credentials


If Meta Ads authorization fails because no default auth config exists, create an auth config with the user's own Meta developer app credentials. Meta Ads generally requires the user's own Meta developer app credentials, so BYO credentials are required to unblock the connection.

## Facebook or Instagram connections authenticate the account selected in Meta's picker and cannot be repointed server-side


If the wrong Facebook/Page/Instagram account is connected, remove the existing Composio/Meta app authorization from Facebook's Business Integrations or business tools settings, sign out of other Facebook accounts or use a clean browser profile, then reconnect and choose the correct account/Page/Instagram asset in Meta's picker. Composio cannot manually switch the underlying account for an already-issued Meta token.

## WhatsApp connections require WABA ID as generic_id, with bearer_token for API key auth


For WhatsApp, OAuth2 connection initiation requires `generic_id`, which is the WABA ID. API-key auth requires both `bearer_token` (System User Token) and `generic_id` (WABA ID). Users can find the WABA ID in the Facebook developer app's WhatsApp API setup, or through Meta APIs such as `/me/businesses` followed by `/{business_id}/owned_whatsapp_business_accounts`. To avoid hardcoding, use hosted auth links so the user can enter required fields during connection.

## What should I know about Instagram webhook verification config?


If a user is configuring Instagram webhooks but Composio does not expose the needed Instagram trigger, the webhook verification config is not required for Composio. For OAuth customization, they can use their own Instagram/Meta auth app credentials, which also lets them configure their own redirect URI.
