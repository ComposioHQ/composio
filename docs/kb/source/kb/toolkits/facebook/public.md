---
type: reference
title: "Facebook"
description: "Customer-safe support knowledge for Facebook."
category: toolkits/facebook
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - facebook
---
# Facebook


## FACEBOOK_DELETE_POST failure can be fixed by using the latest Facebook toolkit version

If `FACEBOOK_DELETE_POST` fails on an older pinned toolkit version, try the latest Facebook toolkit version first. Remove the toolkit version pin or pass `latest` according to the SDK/API path being used; the fix was newer than the affected `20260414_00` version.

## Meta OAuth issues can require adding the Composio redirect URI in the Meta app settings

For Meta/Facebook OAuth failures, verify that the Composio redirect URI is added to the correct redirect URI field in the Meta developer app settings. If the app is using custom credentials, the redirect URI in Meta must match the Composio callback URI used by that auth config. After adding it, retry the connection flow.

## API-key connections can show ACTIVE before MetaAds credentials are live-verified

For API-key auth modes, Composio may mark a connection `ACTIVE` once the required fields are present. The provider token may still fail later when a tool call reaches MetaAds. If the API/SDK supports it, pass `validate_credentials=true` while initiating the connection to run an upstream MetaAds verification call; invalid credentials then return `CredentialsValidationFailed` instead of creating an apparently active connection.

## Meta Ads does not have a managed OAuth app; use your own credentials

If Meta Ads authorization fails because no default auth config exists, create an auth config with the customer's own Meta developer app credentials. Meta Ads does not rely on a Composio-managed OAuth app in this support answer, so BYO credentials are required to unblock the connection.

## Meta Ads toolkit exists; missing APIs should be filed as feature requests

Composio has a Meta Ads toolkit. If the customer needs an API or action that is not exposed in the current toolkit, ask them to file it on the tool request board with the exact Meta endpoint/use case so integrations can prioritize it.

## Meta Ads toolkit was updated to API version v24.0

The Meta Ads toolkit was updated to API version `v24.0` for the recorded issue. For current cases, verify the active toolkit version because Meta versions change over time and customers may be pinned to an older toolkit version.

## Facebook or Instagram connections authenticate the account selected in Meta's picker and cannot be repointed server-side

If the wrong Facebook/Page/Instagram account is connected, remove the existing Composio/Meta app authorization from Facebook's Business Integrations or business tools settings, sign out of other Facebook accounts or use a clean browser profile, then reconnect and choose the correct account/Page/Instagram asset in Meta's picker. Composio cannot manually switch the underlying account for an already-issued Meta token.

## WhatsApp connections require WABA ID as generic_id, with bearer_token for API-key auth

For WhatsApp, OAuth2 connection initiation requires `generic_id`, which is the WABA ID. API-key auth requires both `bearer_token` (System User Token) and `generic_id` (WABA ID). Customers can find the WABA ID in the Facebook developer app's WhatsApp API setup, or through Meta APIs such as `/me/businesses` followed by `/{business_id}/owned_whatsapp_business_accounts`. To avoid hardcoding, use hosted auth links so the user can enter required fields during connection.

## Instagram webhook verification config is not needed if Composio has no Instagram triggers for that use case

If a customer is configuring Instagram webhooks but Composio does not expose the needed Instagram trigger, explain that the webhook verification config is not required for Composio at that time. For OAuth customization, they can use their own Instagram/Meta auth app credentials, which also lets them configure their own redirect URI.

## WhatsApp template sending needs an existing template and required phone number ID tooling

For WhatsApp template sending, the user needs an approved/existing template before sending. If the flow depends on automatically creating templates or discovering the Phone Number ID and the toolkit lacks those tools or they are not working, treat it as a toolkit gap/request rather than a usage error. Ask for the exact template and phone number workflow they need and track the missing tool coverage.
