## How do I set up custom OAuth credentials for Zoho CRM?

For a step-by-step guide on creating and configuring your own Zoho CRM OAuth credentials with Composio, see [How to create OAuth credentials for Zoho CRM](https://composio.dev/auth/zoho).

## Does `ZOHO_MAIL_MESSAGES_SEND_EMAIL` support attachments in newer versions?

Attachment support was added to `ZOHO_MAIL_MESSAGES_SEND_EMAIL`. If a user cannot send attachments with Zoho Mail, they should use a current toolkit version and verify the send-email tool schema includes attachment fields.

## What if Zoho Mail attachment download is not available?

Zoho Mail attachment download may need to be handled as a tool request when the action is not available in the current toolkit. File the exact attachment-download use case through the tool request flow.

## Zoho connections require the correct region/domain extension

Zoho requires the correct region/domain extension during connection initiation. Accepted values include `com`, `eu`, `in`, `cn`, and `au`. Pass the user's Zoho account region, not a full URL, so Composio can build the correct `accounts.zoho.<region>` URL.

## Zoho Mail uses `suffix.one` as the connection initiation domain-extension field

For Zoho Mail, the expected connection initiation field can appear as `suffix.one`, displayed as Domain Extension. Pass values such as `com`, `eu`, or `in` in `config.val["suffix.one"]` when initiating the connection.

## Zoho auth config and connection required fields can be fetched from toolkit schema APIs/SDK

Use `toolkits.get("<toolkit-slug>")` or the toolkit-by-slug API to inspect the full Zoho toolkit schema, including auth config creation fields and connected account initiation fields. This is the reliable way to discover region/domain fields and other required inputs.

## Zoho Books create-estimate moved to the `zoho_invoice` toolkit

For creating estimates, use the `zoho_invoice` toolkit action `ZOHO_INVOICE_CREATE_ESTIMATE`. The estimate tool has shifted away from the Zoho Books toolkit.

## Zoho Books bill tools exist, but missing purchase-order/bill flows may require a feature request

Zoho Books has tools such as `ZOHO_BOOKS_GET_BILL` and `ZOHO_BOOKS_LIST_BILLS`. If the user's required bill or purchase-order endpoint is not exposed, capture the exact Zoho Books API endpoint and file it as a tool request.

## `ZOHO_BOOKS_LIST_ITEMS` has no default `rate`; optional fields can be omitted

`rate` on `ZOHO_BOOKS_LIST_ITEMS` is optional and has no default value in the schema. If an agent sends `rate: 25.5` or another value, that is coming from the model/tool-call generation, not from a Composio schema default. Prompt the model not to pass optional fields unless needed, or call the tool directly with only required arguments.

## When should I use `ZOHO_GET_ZOHO_RECORDS` to find a `lead_id` before converting a Zoho lead?

For Zoho lead conversion, verify the `lead_id` first. Use `ZOHO_GET_ZOHO_RECORDS` to retrieve the lead record and obtain the correct `lead_id`, then pass that value into the conversion tool.

## How does Zoho record-list pagination work?

Zoho list endpoints may return around 200 records per request and require pagination with `page_token` for larger result sets. Multiple tool calls may be needed, and Zoho's own API rate limits can still apply.

## Zoho MCP setup uses OAuth2 and should initiate a new connection from the client/dashboard

Zoho uses OAuth2. For MCP setups, create an MCP config for Zoho, then initiate/connect the Zoho account through the MCP client or dashboard. If the client does not automatically start the OAuth flow, prompting it to initiate a new Zoho connection can help.

## Zoho Mail account IDs should be treated as strings to avoid JS safe-integer precision loss

Zoho Mail account IDs can exceed JavaScript's safe integer range, so they should be modeled and passed as strings. Preserve `account_id` as a string all the way from user input to tool execution.

## Some Zoho surfaces may be auth-only or lack formal tools; use custom tools or file requests

Some Zoho toolkits/surfaces may be auth-only or may not yet have a formal tool set. Users can use custom tools with the connected account credentials, or file a tool request with the exact API endpoint and use case.
