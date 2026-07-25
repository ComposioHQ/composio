---
type: reference
title: "Google Ads"
description: "Customer-safe support knowledge for Google Ads."
category: toolkits/googleads
visibility: public
timestamp: 2026-07-14T00:00:00Z
tags:
  - googleads
---
# Google Ads

## Google Ads developer token now belongs on the auth config, not connection initiation

Google Ads was changed so the developer token lives on the auth config itself, not on each connection initiation request. Older auth configs created before this change do not have the developer token field, and new connections through those auth configs can fail because the token is no longer accepted at the connection level. Create a new Google Ads authConfig with the developer token included, then create a fresh connection through that authConfig.

## Google Ads API requires both OAuth access token and developer token

Google Ads API requests require both an OAuth access token and a Google Ads developer token. For production reliability and isolated provider quota, customers should use their own Google Ads developer token where possible.

## Google Ads 429s can come from Google's shared OAuth/developer-token limits, not Composio plan limits

A Google Ads 429 / `RESOURCE_EXHAUSTED` can come from Google's own API limits or from Composio-managed OAuth/developer-token capacity when that managed app/token is shared across users. Low usage on the customer's own account can still hit the shared managed-app quota. It is not necessarily a Composio billing-plan/tool-call quota issue. First confirm whether the customer uses Composio-managed OAuth or their own credentials/authConfig. If they are on the managed app, advise moving to their own Google Ads OAuth credentials/developer token for isolated quota and production-scale usage.

## Google Ads toolkit versions should be passed without the dashboard `v` prefix

The SDK expects toolkit version strings without the `v` prefix. If the dashboard shows `v20260429_00`, pass `20260429_00` in `toolkitVersions` or per-execution `version`. `dangerouslySkipVersionCheck` is a per-execution option inside the `tools.execute()` payload, not a constructor option. Sessions can manage toolkit versions automatically if the customer migrates to session-based execution.

## Google Ads MCC/sub-account customer ID targeting is supported

The Google Ads toolkit now correctly supports an optional per-call `customer_id` for customer-scoped tools.

- Pass the child/subaccount customer ID as `customer_id`; it becomes the target account in the Google Ads request path.
- If `customer_id` is omitted, the tool falls back to the Customer ID stored on the connection.
- When the requested customer differs from the connection Customer ID, the connection Customer ID can supply the MCC/manager context for Google's `login-customer-id` header unless that header is already present.
- `GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS` is for account discovery. It can return accessible IDs, but later customer-scoped tools still need a selected target customer ID.

If a customer says this still does not work, collect the exact tool, request/log ID, manager/MCC customer ID, child customer ID, and Google error, then route the case to a human. Do not tell them the customer-ID override is still pending.

## Campaign mutate 400s can be caused by unsupported inline Campaign fields

`GOOGLEADS_MUTATE_CAMPAIGNS` may fail with Google Ads 400 `INVALID_ARGUMENT` errors such as `Unknown name "dailyBudget" at operations[0].update` or `Unknown name "targetedLocations" ... Cannot find field`. These failures happen when the request includes fields that are not valid inline Campaign resource fields.

Do not treat these as OAuth failures. Check the tool execution log for rejected payload fields. Known problematic fields include `daily_budget`, `targeted_locations`, `exclusion_locations`, and related date/budget/location fields when sent directly on the Campaign mutate body.

Guide customers away from those inline fields and explain this is a request-shape issue rather than an OAuth failure. A real daily budget requires a CampaignBudget resource (`campaignBudgets:mutate`) and then passing the CampaignBudget resource name through `campaign_budget`. Location targeting belongs in CampaignCriterion mutations, not inline Campaign fields.

Customer-safe wording: "The failure is in the Google Ads campaign-mutate payload shape, not your connection. Some inline campaign fields are being sent in a form that Google Ads rejects. Use CampaignBudget and CampaignCriterion mutations for budget and location targeting instead."

## Google Ads OAuth callback token-exchange failures usually point to bad credentials

The `OAuth callback failed during token exchange` error usually means the credentials used to complete the auth flow are incorrect, most often the client secret. Re-enter or update the client secret in the Google Ads auth config, make sure there are no leading/trailing spaces, and initiate a new connection.

## Older SDK workaround passed Google Ads developer token and customer ID as generic fields

Older SDK flows could pass the Google Ads developer token and customer ID through `config.val` as `generic_token` and `generic_id` with `authScheme: "OAUTH2"`. This was a type-system workaround; prefer the latest SDK and current authConfig developer-token field for new implementations.

## Some Google Ads mutate/create actions are not exposed yet and should be requested

If a required Google Ads mutate/create action is not exposed in the toolkit, ask the customer to file it on the feature request board and include the exact Google Ads resources and operations needed.

## Custom Google OAuth apps need callback routing through the customer's domain for branded consent

For Google toolkits, creating a new authConfig with the customer's OAuth app credentials is not enough for full white-label consent. They also need to route the callback through their own domain using their own redirect URI so Google displays the configured consent screen for that OAuth app.
