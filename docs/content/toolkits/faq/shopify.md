## How do I set up custom OAuth credentials for Shopify?

For a step-by-step guide on creating and configuring your own Shopify OAuth credentials with Composio, see [How to create OAuth credentials for Shopify](https://composio.dev/auth/shopify).

## Why am I seeing "App not found" when connecting Shopify?

The default Shopify OAuth app may be under review or expired. Use your own OAuth app or API authentication method until the default is restored.

## Shopify order update 403s can be caused by missing `read_all_orders` scope

Check the scopes on the Shopify connection. If order reads or updates require access beyond the default order scope set, reconnect with the needed order scopes such as `read_all_orders` before retrying.
