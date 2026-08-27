---
type: "reference"
title: "Facebook"
description: "Public support knowledge for Facebook."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "facebook"
---
# Facebook


## FACEBOOK_DELETE_POST failure can be fixed by using the latest Facebook toolkit version

If `FACEBOOK_DELETE_POST` fails on an older pinned toolkit version, try the latest Facebook toolkit version first. Remove the historical pin or pass `latest` according to the SDK/API path being used.

## Meta OAuth issues can require adding the Composio redirect URI in the Meta app settings

For Meta/Facebook OAuth failures, verify that the Composio redirect URI is added to the correct redirect URI field in the Meta developer app settings. If the app is using custom credentials, the redirect URI in Meta must match the Composio callback URI used by that auth config. After adding it, retry the connection flow.

## Facebook or Instagram connections authenticate the account selected in Meta's picker and cannot be repointed server-side

If the wrong Facebook/Page/Instagram account is connected, remove the existing Composio/Meta app authorization from Facebook's Business Integrations or business tools settings, sign out of other Facebook accounts or use a clean browser profile, then reconnect and choose the correct account/Page/Instagram asset in Meta's picker. Composio cannot manually switch the underlying account for an already-issued Meta token.

## WhatsApp connections require WABA ID as generic_id, with bearer_token for API-key auth

For WhatsApp, OAuth2 connection initiation requires `generic_id`, which is the WABA ID. API-key auth requires both `bearer_token` (System User Token) and `generic_id` (WABA ID). Customers can find the WABA ID in the Facebook developer app's WhatsApp API setup, or through Meta APIs such as `/me/businesses` followed by `/{business_id}/owned_whatsapp_business_accounts`. To avoid hardcoding, use hosted auth links so the user can enter required fields during connection.
