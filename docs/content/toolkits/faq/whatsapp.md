## Why isn't my WhatsApp message being delivered?

WhatsApp has a 24-hour user service window. Recipients only receive messages within 24 hours of their last message to you. To message outside this window, use a template message.

## Why is my WhatsApp connection failing with "Missing required fields"?

Ensure all required fields are provided when initiating the connection. See the [WhatsApp authentication details](https://docs.composio.dev/toolkits/whatsapp#authentication-details).

---

## Does WhatsApp toolkit support WhatsApp Business API accounts, not personal WhatsApp accounts?

WhatsApp API usage requires a WhatsApp Business Account. Personal WhatsApp accounts are for personal communication and are not supported by the WhatsApp Business API flows used by the toolkit. If the user needs WhatsApp messaging through Composio, they should use a WABA-backed business account.

## What does WABA ID mean?

The WABA ID, or WhatsApp Business Account ID, is required because the WhatsApp Business API needs it to identify the business account. Users can find it in Meta Developers under the app's WhatsApp API Setup section, or fetch it programmatically by calling `GET /me/businesses` and then `GET /{business_id}/owned_whatsapp_business_accounts` with an access token.

## What does WhatsApp API key auth need?

For WhatsApp API key auth, pass the system user token as the bearer token and pass the WABA ID as `generic_id`. The required connection fields depend on the auth scheme, so fetch the toolkit/auth-config initiation fields if unsure. Hosted auth links can also collect these values from the user instead of hardcoding them.

## What does WhatsApp OAuth2 initiation still require?

WhatsApp OAuth2 auth still requires `generic_id`, and that value is the WhatsApp Business Account ID. API key auth requires both `bearer_token` and `generic_id`, while OAuth2 only requires `generic_id` for initiation. Differences in required initiation fields usually come from the selected auth scheme.

## What does WhatsApp OAuth require?

For WhatsApp OAuth with a your own Meta app, create a Meta developer app, enable the Business use case, configure the WhatsApp product, and publish the app so users can connect to it. The Meta app/account used during connection should match the account that owns or can access the WhatsApp Business setup.

## How should I handle meta OAuth errors can require adding the Composio redirect URI in the Meta app?

For Meta OAuth apps, add the Composio redirect URI to the correct redirect/callback URI field in the Meta developer app. OAuth failures during callback can happen when the app does not allow the redirect URI used by the Composio auth config.

## How should I handle whatsApp template messages require an existing template before sending?

Sending a WhatsApp template message requires a template to already exist in WhatsApp/Meta. The send-template tool sends an existing template by name/language and parameters; it does not remove the need to create and approve the template first.

## Does `WHATSAPP_SEND_TEMPLATE_MESSAGE` support `components` in newer toolkit versions?

Support for `components` was added to the WhatsApp send-template flow in a newer toolkit version. If a user cannot pass template variables/components, they should upgrade to the latest WhatsApp toolkit version and verify the `components` field is available in the tool schema.

## When sending WhatsApp messages, pass real `phone_number_id` and `to_number` values?

For WhatsApp send-message actions, make sure the action arguments contain the actual `phone_number_id` and recipient `to_number`. Placeholder values in the tool arguments will fail even if the connected account itself is active.

## What does Reading WhatsApp replies mean?

WhatsApp does not expose every reply-reading flow as a normal API action in the toolkit. The better product shape is a trigger/webhook for events such as message or reply received. Where a first-party WhatsApp trigger is not available for the exact use case, TimelinesAI may be an alternative because it includes WhatsApp-related trigger support.

## When should I use Proxy Execute when a WhatsApp/Meta workflow needs direct provider API access with scoped credentials?

For provider API operations that are not exposed as first-class WhatsApp tools, Proxy Execute can be used with a scoped Composio API key that allows proxy execution. This is useful when the user needs to call a Meta/WhatsApp endpoint directly while still going through Composio-managed connection context.
