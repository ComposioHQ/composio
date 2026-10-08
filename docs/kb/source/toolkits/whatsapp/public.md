---
type: "reference"
title: "WhatsApp"
description: "Public support knowledge for WhatsApp."
category: "auth-config"
visibility: "public"
timestamp: "2026-07-14T00:00:00Z"
tags:
  - "whatsapp"
---
# WhatsApp


## WhatsApp toolkit supports WhatsApp Business API accounts, not personal WhatsApp accounts

WhatsApp API usage requires a WhatsApp Business Account. Personal WhatsApp accounts are for personal communication and are not supported by the WhatsApp Business API flows used by the toolkit. If the customer needs WhatsApp messaging through Composio, they should use a WABA-backed business account.

## WABA ID is required for WhatsApp connections

The WABA ID, or WhatsApp Business Account ID, is required because the WhatsApp Business API needs it to identify the business account. Customers can find it in Meta Developers under the app's WhatsApp API Setup section, or fetch it programmatically by calling `GET /me/businesses` and then `GET /{business_id}/owned_whatsapp_business_accounts` with an access token.

## WhatsApp API key auth needs both system user token and WABA ID

For WhatsApp API key auth, pass the system user token as the bearer token and pass the WABA ID as `generic_id`. The required connection fields depend on the auth scheme, so fetch the toolkit/auth-config initiation fields if unsure. Hosted auth links can also collect these values from the user instead of hardcoding them.

## WhatsApp OAuth2 initiation still requires `generic_id` as the WABA ID

WhatsApp OAuth2 auth still requires `generic_id`, and that value is the WhatsApp Business Account ID. API key auth requires both `bearer_token` and `generic_id`, while OAuth2 only requires `generic_id` for initiation. Differences in required initiation fields usually come from the selected auth scheme.

## WhatsApp OAuth requires a Meta developer app with Business use case enabled and published

For WhatsApp OAuth with a customer-owned Meta app, create a Meta developer app, enable the Business use case, configure the WhatsApp product, and publish the app so users can connect to it. The Meta app/account used during connection should match the account that owns or can access the WhatsApp Business setup.

## Meta OAuth errors can require adding the Composio redirect URI in the Meta app

For Meta OAuth apps, add the Composio redirect URI to the correct redirect/callback URI field in the Meta developer app. OAuth failures during callback can happen when the app does not allow the redirect URI used by the Composio auth config.

## WhatsApp template messages require an existing template before sending

Sending a WhatsApp template message requires a template to already exist in WhatsApp/Meta. The send-template tool sends an existing template by name/language and parameters; it does not remove the need to create and approve the template first.

## `WHATSAPP_SEND_TEMPLATE_MESSAGE` supports `components` in newer toolkit versions

Support for `components` was added to the WhatsApp send-template flow in a newer toolkit version. If a customer cannot pass template variables/components, have them upgrade to the latest WhatsApp toolkit version and verify the `components` field is available in the tool schema.

## When sending WhatsApp messages, pass real `phone_number_id` and `to_number` values

For WhatsApp send-message actions, make sure the action arguments contain the actual `phone_number_id` and recipient `to_number`. Placeholder values in the tool arguments will fail even if the connected account itself is active.

## Reading WhatsApp replies is better modeled as triggers/webhooks than a normal read API

WhatsApp does not expose every reply-reading flow as a normal API action in the toolkit. The better product shape is a trigger/webhook for events such as message or reply received. Where a first-party WhatsApp trigger is not available for the exact use case, TimelinesAI may be an alternative because it includes WhatsApp-related trigger support.

## Use Proxy Execute when a WhatsApp/Meta workflow needs direct provider API access with scoped credentials

For provider API operations that are not exposed as first-class WhatsApp tools, Proxy Execute can be used with a scoped Composio API key that allows proxy execution. This is useful when the customer needs to call a Meta/WhatsApp endpoint directly while still going through Composio-managed connection context.

## WhatsApp Business app coexistence is enabled through Meta Embedded Signup

Keeping an existing WhatsApp Business app number active while also using the Cloud API is a Meta-side coexistence onboarding flow, not a Composio activation toggle. Follow Meta's [Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) flow through a Solution Partner or Tech Provider that supports it.

After the number is active on Cloud API, connect its WABA in Composio through the normal WhatsApp setup. For API-key auth, use the system user token as `bearer_token` and the WABA ID as `generic_id`.

If the number is shown as `ON_PREMISE`, it may need Meta's On-Premises API to Cloud API migration steps before normal registration or coexistence. Route that onboarding/migration step to Meta or the customer's BSP, then help with the Composio connection once Cloud API is active.
