## How do I set up custom OAuth credentials for Microsoft (Outlook)?

For a step-by-step guide on creating and configuring your own Microsoft (Outlook) OAuth credentials with Composio, see [How to create OAuth credentials for Microsoft (Outlook)](https://composio.dev/auth/outlook).

## Why does the Outlook new message trigger only return a message ID?

Outlook's webhooks send only the message ID on trigger events. To get the full message (subject, body, headers), call the `OUTLOOK_GET_MESSAGE` tool with that message ID.

## Why doesn't `OUTLOOK_SEND_EMAIL` return message details?

Microsoft Graph's send endpoint returns an HTTP 202 with no message details. To get the message ID and conversation ID, create a draft first with `OUTLOOK_CREATE_DRAFT`, then send it with `OUTLOOK_SEND_DRAFT`. See [Microsoft Graph docs](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0&tabs=http).

## What's the @odata.context / @odata URL?

The `@odata.context` URL provides metadata about the response (entity set, service version, and schema info) to help clients interpret the payload structure. It's primarily used for pagination and data parsing, not as a direct URL to the resource itself.

## Why do Outlook connections show "Needs Admin Approval" or "admin approval required"?

Microsoft/Outlook admin-consent issues are Microsoft 365 tenant-level approval problems, not something fixed by changing only the Composio connection. Adding delegated permissions to an Azure app registration is not the same as granting tenant admin consent. Once a tenant admin grants consent for the requested permissions, affected users should start a fresh normal Outlook connection flow with their own accounts; the admin does not need to connect every user individually.

Two concrete ways an admin can approve are:

1. **App Registration / OAuth app level:** in Microsoft Entra / Azure Portal, go to **App registrations**, open the OAuth app, go to **API permissions**, click **Grant admin consent for [Tenant Name]**, then confirm/save.
2. **Enterprise Applications / org level:** in Microsoft Entra / Azure Portal, go to **Enterprise applications**, find the Composio/Outlook app or the user's own service principal, open **Permissions** / admin-consent controls, then grant admin consent for the organization.

![Microsoft Entra API permissions page showing the Grant admin consent action](/images/kb/toolkits/outlook/outlook-admin-consent-api-permissions.png)

Microsoft may also show an in-flow `sign in as an admin` / `Connectez-vous avec ce compte` option on the OAuth screen. Treat that as a secondary path, not the first recommendation. If an admin signs in through the same OAuth attempt, that attempt may connect the admin's mailbox instead of the original user's mailbox. After tenant-wide consent is granted, the original user should start a fresh Outlook connection flow with their own account.

For custom Microsoft OAuth apps, a verified publisher can improve branding and may reduce consent friction in tenants that allow user consent for verified publishers and the requested delegated permissions. It does not remove the admin-consent requirement in every tenant; each Microsoft 365 tenant's user-consent policy and the exact scopes requested still decide whether admin approval is needed.
