## Why isn't my WhatsApp message being delivered?

WhatsApp has a 24-hour customer service window. Recipients only receive messages within 24 hours of their last message to you. To message outside this window, use a template message.

## Can I use a personal WhatsApp account with the WhatsApp toolkit?

No. The WhatsApp toolkit is for WhatsApp Business API flows, so the connected account needs to be backed by a WhatsApp Business Account (WABA). Personal WhatsApp accounts are not supported for these API flows.

If you need to send or receive WhatsApp messages through the toolkit, set up or connect the relevant WABA-backed business account in Meta first.

## What is a WABA ID?

The WABA ID, or WhatsApp Business Account ID, is required because the WhatsApp Business API needs it to identify the business account. Users can find it in Meta Developers under the app's WhatsApp API Setup section, or fetch it programmatically by calling `GET /me/businesses` and then `GET /{business_id}/owned_whatsapp_business_accounts` with an access token.

## WhatsApp template messages require an existing template before sending

Sending a WhatsApp template message requires a template to already exist in WhatsApp/Meta. The send-template tool sends an existing template by name/language and parameters; it does not remove the need to create and approve the template first.

## Why is my WhatsApp connection failing with "Missing required fields"?

Ensure all required fields are provided when initiating the connection. See the [WhatsApp authentication details](https://docs.composio.dev/toolkits/whatsapp#authentication-details).
