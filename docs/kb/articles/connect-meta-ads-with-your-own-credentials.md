Meta Ads does not rely on a Composio-managed OAuth app. If authorization fails because no default auth config exists, create an auth config with your own Meta developer app credentials — bring-your-own credentials is the supported path here.

## Register the redirect URI

Meta OAuth failures frequently come down to the Composio redirect URI not being present in the Meta developer app settings. Add it to the correct redirect URI field, and make sure it matches the callback URI used by that auth config. Then retry the connection flow.

## An ACTIVE connection is not proof of working credentials

For API-key auth modes, Composio marks a connection `ACTIVE` once the required fields are present. The provider credentials are not live-verified at that moment, so a connection can read as healthy and still fail on the first real tool call. Treat the first successful execution, not the connection status, as confirmation.

## Toolkit versions move with Meta

The Meta Ads toolkit tracks Meta's API versions, which change over time. If behavior looks out of date, check which toolkit version the request is pinned to before investigating further.
