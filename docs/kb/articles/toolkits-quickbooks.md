Use this guide to configure QuickBooks OAuth for the correct environment, maintain connections, and target the intended company account.

## Configure QuickBooks OAuth for the environment

**Use the sandbox API base URL for sandbox accounts.** For QuickBooks sandbox accounts, pass `https://sandbox-quickbooks.api.intuit.com` as the URL/base URL when initiating the connection. Production connections should use the production Intuit API base URL.

**Match Intuit credentials and the Composio redirect URL.** When creating a QuickBooks auth config, enter the QuickBooks OAuth credentials from the Intuit developer app and configure the Composio redirect URL in the QuickBooks auth app. A mismatch or missing redirect URL can break the OAuth flow.

**Use current toolkit support for custom auth and token URLs.** QuickBooks toolkit support accepts auth and token URLs during connection initiation. If you need sandbox or custom Intuit OAuth endpoints, use a toolkit version that supports passing those URLs.

**Request the payment scope only when payment access is enabled.** If the QuickBooks OAuth flow includes the payments scope `com.intuit.quickbooks.payment`, the QuickBooks payment module must be enabled for that account/app. If the customer does not need payment tools, remove that scope and retry the connection.

## Maintain the QuickBooks connection and auth experience

**Let Composio refresh tokens and retry transient failures.** QuickBooks OAuth refresh is handled by Composio through the provider's token endpoint. The current refresh path retries transient failures and uses credential-expiry timing rather than promising a fixed 15-minute schedule. If the provider conclusively rejects the grant or failures persist past the platform's retry budget, the connected account expires and the user must reauthenticate through a new auth link.

**Send users directly to Intuit when the hosted auth screen should be skipped.** The Composio auth screen can be skipped for QuickBooks by sending users directly to the OAuth provider, following Composio's white-labeling/direct-provider auth flow. Use this when the customer wants the user to see the provider consent screen without the intermediate Composio auth screen.

## Target the correct QuickBooks account and toolkit version

**Retry realm or company mapping issues on the latest toolkit version.** For QuickBooks realm/company mapping issues, retry on the latest toolkit version rather than a historical pinned version.

**Use distinct account identifiers for multiple QuickBooks accounts.** Create separate connected accounts for each QuickBooks account, preferably with distinct `user_id` values. In Claude/MCP setup, append the desired `connected_account_id` or `user_id` to the MCP URL/configuration so the session targets the intended QuickBooks connection.
