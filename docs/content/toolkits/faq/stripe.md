## How do I set up custom OAuth credentials for Stripe?

For a step-by-step guide on creating and configuring your own Stripe OAuth credentials with Composio, see [How to create OAuth credentials for Stripe](https://composio.dev/auth/stripe).

## What does Stripe mean?

Composio supports the Stripe toolkit with OAuth2 and API-key auth modes. The marketplace entry is available on the Stripe toolkit page.

## What should I know about Stripe API-key auth, use the Stripe secret key from Developers -> API Keys -> Standard keys?

For Stripe API-key auth, use the Stripe secret key from Stripe Dashboard -> Developers -> API Keys -> Standard keys -> Secret key. In API/SDK connection payloads, the auth config field may need to be passed as `api_key`.

## How should I handle one Stripe MCP/API-key connection maps to one Stripe account unless the user uses Stripe Connect?

Stripe usually uses different API keys for separate accounts, so one connected account/MCP server has access to one Stripe account. If the user uses Stripe Connect, the platform can consolidate connected accounts under one platform API key and may better fit multi-account workflows.

## How should I handle MRR can be calculated from `STRIPE_LIST_SUBSCRIPTIONS`?

Use `STRIPE_LIST_SUBSCRIPTIONS` to retrieve subscription data, then calculate MRR from the returned subscriptions in the agent/application layer.

## How should I handle duplicate Stripe trigger events can be caused by stale webhook records left in Stripe?

If Stripe sends duplicate trigger payloads, check Stripe webhook/event destinations. Support found a bug where deleting Stripe triggers did not always clean up corresponding webhook records in Stripe, so deleting and recreating triggers could accumulate multiple webhook destinations. As a workaround, disable/delete the extra Stripe webhook destination so only one remains active.

## How should I handle some Stripe triggers worked with API-key auth but failed with OAuth on verified-account/webhook permissions?

If Stripe trigger creation fails under OAuth but works with API-key auth, check Stripe account verification and webhook permissions. Support saw `STRIPE_CHECKOUT_SESSION_COMPLETED_TRIGGER` work with API-key auth while OAuth trigger creation failed with permission errors such as not being permitted to configure webhook endpoints on a connected account.

## How should I handle A Stripe trigger should create a corresponding subscription/webhook in Stripe?

When troubleshooting missing Stripe checkout webhook events, verify both sides: confirm the trigger was created in Composio, then check whether the corresponding webhook/subscription was created in the user's Stripe dashboard. Recreating the trigger can be a valid recovery step if the webhook subscription was not created correctly.

## How should I handle additional Stripe endpoints can be added as toolkit requests?

If a Stripe endpoint/tool is missing, collect the exact endpoints needed and route them as toolkit requests. Support explicitly discussed adding endpoints such as balance transactions, search for charges, cash balance, credit balances, coupons, and payouts.

## How should I handle stripe tokens may not be revocable programmatically through provider APIs?

For Stripe OAuth connections, provider-side programmatic revocation may not be available. If Composio cannot revoke the token through the provider API, The user should remove the connected app manually from Stripe/app settings as part of the revocation process.
