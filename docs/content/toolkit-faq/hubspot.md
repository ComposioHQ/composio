## How do I set up custom OAuth credentials for HubSpot?

For a step-by-step guide on creating and configuring your own HubSpot OAuth credentials with Composio, see [How to create OAuth credentials for HubSpot](https://composio.dev/auth/hubspot).

## Why am I getting errors with `limit` on HubSpot contact searches?

The `HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA` and `HUBSPOT_LIST_CONTACTS_PAGE` tools have a maximum limit of 100 results per request. Set `limit` to 100 or lower to avoid errors.

## Why can't I set up webhooks for HubSpot?

HubSpot webhooks require a public app with an App ID and Developer API Key. Private or internal apps cannot receive webhooks.
