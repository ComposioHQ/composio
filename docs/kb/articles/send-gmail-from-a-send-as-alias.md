Pass `from_email` on `GMAIL_SEND_EMAIL` to choose which Gmail send-as alias the message is sent from. The alias must already be configured on the Gmail account.

For the `user_id` argument on Gmail tool calls, `me` refers to the authenticated connected account, so you rarely need to resolve and pass an address.

## Recipients

`GMAIL_SEND_EMAIL` accepts at least one of `to` (or `recipient_email`), `cc`, or `bcc` — no single recipient field is required, which keeps the tool usable across different composition flows.

Over hosted MCP or Tool Router calls through `COMPOSIO_MULTI_EXECUTE_TOOL`, put recipient fields inside the nested tool `arguments` object. Prefer `recipient_email` for the first To recipient and `extra_recipients` for the rest, unless the current schema exposes another shape.

If an active connection returns `At least one of 'to' (or 'recipient_email'), 'cc', or 'bcc' must be provided`, the tool never received a recipient channel and failed before reaching Gmail. Retry with the nested `recipient_email` shape.
