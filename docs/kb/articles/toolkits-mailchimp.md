## Mailchimp server prefix is the URL prefix before .admin.mailchimp.com

When connecting Mailchimp, pass the correct server prefix. It is the part of the Mailchimp URL before `.admin.mailchimp.com`. For example, if the Mailchimp URL is `https://us19.admin.mailchimp.com/`, the server prefix is `us19`. A wrong prefix can cause Mailchimp API calls to fail even if the API key/token itself looks correct.

## Use subdomain or dc, not server_prefix, for Mailchimp connectionConfig

For Mailchimp API connection configuration, send `connectionConfig.subdomain` with the server prefix value, or use the legacy alias `dc`. Do not send `server_prefix`; that key is ignored by the validator and may fall back to a default such as `us21`. The UI label may say Server Prefix, but the API field name is `subdomain`.

## Some Mailchimp tools require at least the Mailchimp Essentials plan

If Mailchimp tools fail despite the connection looking correct, check the customer's Mailchimp plan. Some Mailchimp API/tool capabilities require at least the Mailchimp Essentials plan. A free Mailchimp account may not be enough for the requested tool flow.

## Mailchimp Proxy Execute with raw access token also needs subdomain

When using Proxy Execute with Mailchimp custom connection data, include both the OAuth access token and Mailchimp `subdomain`/server prefix. The endpoint can then be called through `/api/v3/tools/execute/proxy` with `toolkitSlug: "mailchimp"`, `authScheme: "OAUTH2"`, and `val` containing `access_token` plus `subdomain` such as `us20`.

## Mailchimp has trigger support in the supported-trigger toolkit list

Mailchimp appears in the supported-trigger toolkit list. Before using a specific Mailchimp trigger, verify that the exact trigger or event exists in the current toolkit. If it does not, submit the use case through the Composio request portal.
