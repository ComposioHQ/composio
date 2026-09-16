---
type: "reference"
title: "Outlook"
description: "Public support knowledge for Outlook."
category: "auth-config"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "outlook"
---
# Outlook


## Outlook desktop users still need to authenticate the cloud Microsoft account in browser

Outlook tools authenticate through the Microsoft account/OAuth flow in a browser. If the customer only uses Outlook desktop, they still need to log into the underlying Microsoft/Outlook account in the browser to complete OAuth. Desktop and cloud use the same account, so once the account is authenticated, the tools can operate against that mailbox.

## Connect MCP exposes meta-tools, not individual Outlook tools, by design

`connect.composio.dev/mcp` uses Tool Router architecture, so it intentionally exposes meta-tools such as `COMPOSIO_SEARCH_TOOLS` and `COMPOSIO_MULTI_EXECUTE_TOOL`. The agent discovers and executes Outlook tools at runtime through those meta-tools. If a customer needs specific Outlook tools without meta-tool round trips, use SDK direct execution or create a focused MCP config with selected Outlook tools.

## For Outlook shared mailboxes, pass the shared mailbox address as `user_id`/mailbox target

Delegated access must already be granted in the Microsoft tenant.

This applies to delegated and S2S/application auth patterns where the tenant permissions allow shared mailbox access.

## Remove obsolete or invalid Outlook tool slugs from MCP configs and patch `allowed_tools`

If an Outlook MCP config fails due to obsolete or invalid tool slugs, update the MCP config to remove them and include only current supported tools in `allowed_tools`. This can be done through the dashboard or the MCP patch endpoint.

## Outlook multi-account sessions require explicit per-call `account` selection and aliases

For multi-account Outlook sessions, every connected account needs a unique non-null alias, the session should set `multi_account.enable=true` and `require_explicit_selection=true`, and the LLM must set the `account` field on each item in `COMPOSIO_MULTI_EXECUTE_TOOL.tools[]`. Without explicit selection, Tool Router cannot disambiguate and may default to one account.

## Use `get_scopes_required` with Outlook tool slugs, then refresh/reconnect after scope changes

For Outlook 403s, look up required scopes with `/api/v3/tools/get_scopes_required` using the exact Outlook tool slug, not the toolkit name. For example `OUTLOOK_GET_MAILBOX_SETTINGS` requires `MailboxSettings.ReadWrite`. After adding scopes to the auth config, create a new auth link session and have the user reconnect so the new scopes are granted.

## Outlook/Microsoft apps may need admin consent from App Registration or Enterprise Applications

Microsoft/Outlook admin-consent issues are Microsoft 365 tenant-level approval problems, not a Composio-side connection configuration issue. Adding delegated permissions to an Azure app registration is not the same as granting tenant admin consent. Once a tenant admin grants consent for the requested permissions, affected users should start a fresh normal Outlook connection flow with their own accounts; the admin does not need to connect every user individually.

Two concrete ways an admin can approve:

1. **App Registration / OAuth app level:** in Microsoft Entra / Azure Portal, go to **App registrations**, open the OAuth app, go to **API permissions**, click **Grant admin consent for [Tenant Name]**, then confirm/save.

2. **Enterprise Applications / org level:** in Microsoft Entra / Azure Portal, go to **Enterprise applications**, find the Composio/Outlook app or the customer's own service principal, open **Permissions** / admin-consent controls, then grant admin consent for the organization.

For the Composio-managed Outlook app, Microsoft's in-flow `sign in as an admin` / `Connectez-vous avec ce compte` link is also a real tenant-admin consent path. If the admin signs in through that same OAuth attempt, that attempt may connect the admin's mailbox, not the original user's mailbox; treat that connected account as the admin's and have the original user start a fresh Connect flow afterward. Incomplete/pending Outlook connection attempts expire after about 10 minutes, so an expired non-admin attempt cannot be resumed. Nothing needs to happen on Composio's side between the admin grant and the user's retry: no cache clear, webhook, or manual status change.

Do not share or guess a `client_id` for the Composio-managed Outlook app when a customer asks for a direct Microsoft `adminconsent` URL. Confirm the current managed Outlook app/client identifier with product/security or the live auth config source before giving it to a customer. For a customer-owned/BYOA Azure app, the customer can use their own app's `client_id` and tenant ID in Microsoft's admin-consent URL.

A customer-owned verified-publisher Azure app can improve branding/control and may reduce consent friction in tenants that allow user consent for verified publishers and the requested delegated permissions. It does not guarantee that no admin approval is needed: each Microsoft tenant's user-consent policy and the exact scopes requested still decide whether admin consent is required.

## Outlook/Gmail email attachments through SDK should be passed as file paths

When using SDK automatic file handling for email attachments, pass the local file path directly in the `attachment`/`attachments` argument. Do not pass only a filename or raw content fields unless the tool schema explicitly asks for them.

## Incomplete Outlook auth links expire after about 10 minutes and mark the connection `EXPIRED`

If a connected account expires because the initiation flow was not completed, the likely reason is that the authorization link timed out. Users have roughly a 10-minute window to complete the auth flow; otherwise Composio invalidates the link and marks the connected account `EXPIRED`.
