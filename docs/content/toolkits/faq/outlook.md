## How do I set up custom OAuth credentials for Microsoft (Outlook)?

For a step-by-step guide on creating and configuring your own Microsoft (Outlook) OAuth credentials with Composio, see [How to create OAuth credentials for Microsoft (Outlook)](https://composio.dev/auth/outlook).

## Why does the Outlook new message trigger only return a message ID?

Outlook's webhooks send only the message ID on trigger events. To get the full message (subject, body, headers), call the `OUTLOOK_GET_MESSAGE` tool with that message ID.

## Why doesn't `OUTLOOK_SEND_EMAIL` return message details?

Microsoft Graph's send endpoint returns an HTTP 202 with no message details. To get the message ID and conversation ID, create a draft first with `OUTLOOK_CREATE_DRAFT`, then send it with `OUTLOOK_SEND_DRAFT`. See [Microsoft Graph docs](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0&tabs=http).

## What's the @odata.context / @odata URL?

The `@odata.context` URL provides metadata about the response (entity set, service version, and schema info) to help clients interpret the payload structure. It's primarily used for pagination and data parsing, not as a direct URL to the resource itself.

---

## What do Outlook desktop users need for OAuth?

Outlook tools authenticate through the Microsoft account/OAuth flow in a browser. If the user only uses Outlook desktop, they still need to log into the underlying Microsoft/Outlook account in the browser to complete OAuth. Desktop and cloud use the same account, so once the account is authenticated, the tools can operate against that mailbox.

## Connect MCP exposes meta-tools, not individual Outlook tools, by design

`connect.composio.dev/mcp` uses Tool Router architecture, so it intentionally exposes meta-tools such as `COMPOSIO_SEARCH_TOOLS` and `COMPOSIO_MULTI_EXECUTE_TOOL`. The agent discovers and executes Outlook tools at runtime through those meta-tools. If a user needs specific Outlook tools without meta-tool round trips, use SDK direct execution or create a focused MCP config with selected Outlook tools.

## When should I use `get_scopes_required` with Outlook tool slugs, then refresh/reconnect after scope changes?

For Outlook 403s, look up required scopes with `/api/v3/tools/get_scopes_required` using the exact Outlook tool slug, not the toolkit name. For example `OUTLOOK_GET_MAILBOX_SETTINGS` requires `MailboxSettings.ReadWrite`. After adding scopes to the auth config, refresh the existing connection through the connected-account refresh endpoint or create a new connection so the new scopes are granted.

## What should For You users know about Outlook scope configuration?

On For You, users cannot configure OAuth scopes directly. If an Outlook For You user needs an extra scope, the scope may need to be added on the account side before the user reconnects Outlook.

## When do Outlook/Microsoft apps need tenant admin consent?

Microsoft/Outlook admin-consent issues are Microsoft 365 tenant-level approval problems, not something fixed by changing only the Composio connection. Adding delegated permissions to an Azure app registration is not the same as granting tenant admin consent. Once a tenant admin grants consent for the requested permissions, affected users should start a fresh normal Outlook connection flow with their own accounts; the admin does not need to connect every user individually.

Two concrete ways an admin can approve:

1. **App Registration / OAuth app level:** in Microsoft Entra / Azure Portal, go to **App registrations**, open the OAuth app, go to **API permissions**, click **Grant admin consent for [Tenant Name]**, then confirm/save.
2. **Enterprise Applications / org level:** in Microsoft Entra / Azure Portal, go to **Enterprise applications**, find the Composio/Outlook app or the user's own service principal, open **Permissions** / admin-consent controls, then grant admin consent for the organization.

For the Composio-managed Outlook app, Microsoft's in-flow `sign in as an admin` / `Connectez-vous avec ce compte` link is also a real tenant-admin consent path. If the admin signs in through that same OAuth attempt, that attempt may connect the admin's mailbox, not the original user's mailbox; treat that connected account as the admin's and have the original user start a fresh Connect flow afterward. Incomplete/pending Outlook connection attempts expire after about 10 minutes, so an expired non-admin attempt cannot be resumed. Nothing needs to happen on Composio's side between the admin grant and the user's retry: no cache clear, webhook, or manual status change.

Your own verified-publisher Azure app can improve branding and control, and may reduce consent friction in tenants that allow user consent for verified publishers and the requested delegated permissions. It does not remove the admin-consent requirement: each tenant's user-consent policy and the exact scopes requested still decide whether admin consent is needed.

## Outlook trigger issues can be stale subscriptions/no trigger logs or provider-side account-specific failures

When Outlook triggers stop, check whether the connected account has active trigger logs and webhook subscriptions. If a specific account has stale triggers with no logs/subscriptions, reconnect or recreate the trigger. If Composio sees no provider warnings/errors and only one Outlook account is affected, the user should also check with Microsoft/Outlook support while Composio investigates.
