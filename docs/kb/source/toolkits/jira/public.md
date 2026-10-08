---
type: "reference"
title: "Jira"
description: "Public support knowledge for Jira."
category: "auth-config"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "jira"
---
# Jira

## Keep Jira OAuth scopes within Atlassian's supported set

Jira/Atlassian limits an OAuth app to 50 scopes, and unsupported or mismatched scopes can make consent fail. For a customer-owned app, keep the auth config aligned with the scopes approved on that Atlassian app. Do not diagnose a current managed-auth failure from the old resolved managed-app scope incident; inspect the customer's current consent error and auth config.

## Pin custom Jira authConfig when creating Tool Router sessions

When using a custom Jira OAuth app with Tool Router, pass the custom auth config while creating the session. If the session does not specify the Jira auth config, Tool Router can fall back to an auto-generated/default Jira config and fail to see the customer's active custom-auth connections. Pin the active BYOA config, for example `auth_configs: { jira: "<auth_config_id>" }`, so Tool Router resolves the intended Jira connected accounts.

## Jira custom token execution needs the Atlassian base URL/subdomain

Jira expects the tenant URL in the form `https://<subdomain>.atlassian.net`. Supply the `subdomain` when initiating the connected account for OAuth2, API-key, or S2S OAuth2 auth. `JIRA_GET_SERVER_INFO` can help confirm the base URL. Do not rely on the old SDK workaround that injected a raw access token through `customConnectionData`.

## Jira search pagination tokens returned by current tools preserve search context

Current Jira search tools wrap provider pagination tokens with the original search context. Pass the `next_page_token` returned by the same Composio action directly to its next call. If a caller instead supplies a raw Jira `nextPageToken`, it must also supply the original JQL.

Workaround:

- Do not pass a token returned by one Jira action to a different action.

- Use the token immediately for the next page.

- Do not persist old tokens or retry rejected tokens. If Jira returns `invalid or expired` even with the same original context, discard the token and restart pagination from page 1.

## Jira OAuth redirect URI must match the authConfig and Atlassian app

For Jira/Atlassian OAuth, configure the same redirect URI in both the Composio auth config and the Atlassian OAuth app. Copy the callback shown by the current auth-config flow or documentation and match it exactly. Do not reuse legacy v1 or v3 callback paths from old support answers.

## Missing `audience=api.atlassian.com` can prevent Jira refresh tokens

Atlassian OAuth 2.0 requires `audience=api.atlassian.com` in the authorization URL. Without this parameter, Atlassian may not honor `offline_access`, meaning no refresh token is returned and the access token expires without being refreshable. If Jira credentials expire immediately, check whether the connected account is missing `offline_access` and whether the Jira OAuth config includes the required `audience` parameter. As an urgent workaround, API key auth with Atlassian email + API token can provide stable non-expiring credentials.

## Use `JIRA_GET_CREATE_METADATA_ISSUE_TYPE_FIELDS` instead of deprecated create metadata behavior

Use `JIRA_GET_CREATE_METADATA_ISSUE_TYPE_FIELDS` for the closest replacement behavior to the deprecated `JIRA_GET_ISSUE_CREATE_METADATA` flow. The replacement was added after Jira deprecated the older create-metadata API behavior.

## Download Jira attachments with `JIRA_GET_ATTACHMENT`

Use `JIRA_GET_ATTACHMENT` to retrieve the binary content of a Jira attachment by attachment ID. This tool is intended for downloading a specific file attached to a Jira issue.

## Jira tool-call payload retention follows the project log-storage setting

Composio manages Jira OAuth tokens and returns Jira API responses to the customer's application. Whether request and response payloads are retained in Composio tool logs follows the project's log-storage setting; **Don't store data** omits payload content from new log rows but preserves audit metadata. The customer's own agent or application may retain tool outputs separately.

## Jira service account use requires customer-owned credentials and scopes

For Jira service-account-style usage, customers should use their own credentials with the required Jira and Jira service-account scopes when no dedicated managed auth app is available for that flow.
