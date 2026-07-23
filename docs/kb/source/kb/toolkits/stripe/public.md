---
type: reference
title: "Stripe"
description: "Customer-safe support knowledge for Stripe."
category: toolkits/stripe
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - stripe
---
# Stripe


## Stripe is supported and offers OAuth2 and API-key auth modes

Composio supports the Stripe toolkit with OAuth2 and API-key auth modes; the marketplace entry is available on the Stripe toolkit page.

## For Stripe API-key auth, use the Stripe secret key from Developers -> API Keys -> Standard keys

For Stripe API-key auth, use the Stripe secret key from Stripe Dashboard -> Developers -> API Keys -> Standard keys -> Secret key. In API/SDK connection payloads, the auth config field may need to be passed as `api_key`.

## Stripe may require customer-owned credentials because a default OAuth app is not always possible

For Stripe, customers should be prepared to use their own Stripe credentials. Managed credentials may be unavailable because Stripe OAuth requires a client ID and API key from a production Stripe account.

## One Stripe MCP/API-key connection maps to one Stripe account unless the customer uses Stripe Connect

Stripe usually uses different API keys for separate accounts, so one connected account/MCP server has access to one Stripe account. If the customer uses Stripe Connect, the platform can consolidate connected accounts under one platform API key and may better fit multi-account workflows.

## MRR can be calculated from `STRIPE_LIST_SUBSCRIPTIONS`

Use `STRIPE_LIST_SUBSCRIPTIONS` to retrieve subscription data, then calculate MRR from the returned subscriptions in the agent/application layer.

## Stripe dispute/payment-success triggers may need feature requests if not currently supported

If the requested Stripe trigger is not available, submit a trigger/tool request with the exact Stripe event. Unsupported dispute events such as `charge.dispute.*` do not have a generic trigger workaround.

## Duplicate Stripe trigger events can be caused by stale webhook records left in Stripe

If Stripe sends duplicate trigger payloads, check Stripe webhook/event destinations. Deleting and recreating triggers can leave multiple webhook destinations in Stripe. Disable or delete the extra Stripe webhook destination so only one remains active.

## Some Stripe triggers worked with API-key auth but failed with OAuth on verified-account/webhook permissions

If Stripe trigger creation fails under OAuth but works with API-key auth, check Stripe account verification and webhook permissions. OAuth trigger creation can fail when the connected account is not permitted to configure webhook endpoints.

## A Stripe trigger should create a corresponding subscription/webhook in Stripe

When debugging missing Stripe checkout webhook events, verify both sides: confirm the trigger was created in Composio, then check whether the corresponding webhook/subscription was created in the customer's Stripe dashboard. Recreating the trigger can be a valid recovery step if the webhook subscription was not created correctly.

## Additional Stripe endpoints can be added as toolkit requests

If a Stripe endpoint/tool is missing, collect the exact endpoints needed and route them as toolkit requests. Examples include balance transactions, charge search, cash balance, credit balances, coupons, and payouts.

## Stripe tokens may not be revocable programmatically through provider APIs

For Stripe OAuth connections, provider-side programmatic revocation may not be available. If Composio cannot revoke the token through the provider API, ask the user to remove the connected app manually from Stripe/app settings as part of the revocation process.
