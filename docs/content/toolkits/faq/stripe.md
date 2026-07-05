## How do I set up custom OAuth credentials for Stripe?

For a step-by-step guide on creating and configuring your own Stripe OAuth credentials with Composio, see [How to create OAuth credentials for Stripe](https://composio.dev/auth/stripe).

## How does Stripe authentication work?

Composio supports the Stripe toolkit with OAuth2 and API-key auth modes. The marketplace entry is available on the Stripe toolkit page.

## Which Stripe API key should I use for API-key auth?

For Stripe API-key auth, use the Stripe secret key from Stripe Dashboard -> Developers -> API Keys -> Standard keys -> Secret key. In API/SDK connection payloads, the auth config field may need to be passed as `api_key`.

## One Stripe MCP/API-key connection maps to one Stripe account unless the user uses Stripe Connect

Stripe usually uses different API keys for separate accounts, so one connected account/MCP server has access to one Stripe account. If the user uses Stripe Connect, the platform can consolidate connected accounts under one platform API key and may better fit multi-account workflows.

## MRR can be calculated from `STRIPE_LIST_SUBSCRIPTIONS`

Use `STRIPE_LIST_SUBSCRIPTIONS` to retrieve subscription data, then calculate MRR from the returned subscriptions in the agent/application layer.

## Duplicate Stripe trigger events can be caused by stale webhook records left in Stripe

If Stripe sends duplicate trigger payloads, check Stripe webhook/event destinations in the Stripe dashboard. Duplicate webhook destinations can cause duplicate event deliveries. Disable or delete extra Stripe webhook destinations so only the intended destination remains active.

## Some Stripe triggers worked with API key auth but failed with OAuth on verified-account/webhook permissions

If Stripe trigger creation fails under OAuth but works with API-key auth, check Stripe account verification and webhook permissions. OAuth-connected accounts may not be permitted to configure webhook endpoints depending on the Stripe account state and granted permissions.

## A Stripe trigger should create a corresponding subscription/webhook in Stripe

When troubleshooting missing Stripe checkout webhook events, verify both sides: confirm the trigger was created in Composio, then check whether the corresponding webhook/subscription was created in the user's Stripe dashboard. Recreating the trigger can be a valid recovery step if the webhook subscription was not created correctly.

## Additional Stripe endpoints can be added as toolkit requests

If a Stripe endpoint/tool is missing, submit the exact endpoints needed through the toolkit request flow. Useful examples include balance transactions, search for charges, cash balance, credit balances, coupons, and payouts.

## Stripe tokens may not be revocable programmatically through provider APIs

For Stripe OAuth connections, provider-side programmatic revocation may not be available. If Composio cannot revoke the token through the provider API, the user should remove the connected app manually from Stripe/app settings as part of the revocation process.
