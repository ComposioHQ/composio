## How do I set up custom OAuth credentials for Microsoft (Outlook)?

For a step-by-step guide on creating and configuring your own Microsoft (Outlook) OAuth credentials with Composio, see [How to create OAuth credentials for Microsoft (Outlook)](https://composio.dev/auth/outlook).

## Why does the Outlook new message trigger only return a message ID?

Outlook's webhooks send only the message ID on trigger events. To get the full message (subject, body, headers), call the `OUTLOOK_GET_MESSAGE` tool with that message ID.

## Why doesn't `OUTLOOK_SEND_EMAIL` return message details?

Microsoft Graph's send endpoint returns an HTTP 202 with no message details. To get the message ID and conversation ID, create a draft first with `OUTLOOK_CREATE_DRAFT`, then send it with `OUTLOOK_SEND_DRAFT`. See [Microsoft Graph docs](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0&tabs=http).

## What's the @odata.context / @odata URL?

The `@odata.context` URL provides metadata about the response (entity set, service version, and schema info) to help clients interpret the payload structure. It's primarily used for pagination and data parsing — not as a direct URL to the resource itself.

---
