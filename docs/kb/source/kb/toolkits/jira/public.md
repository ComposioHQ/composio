---
type: reference
title: "Jira"
description: "Customer-safe support knowledge for Jira."
category: toolkits/jira
visibility: public
timestamp: 2026-07-16T00:00:00Z
tags:
  - jira
---
# Jira

The sections below provide reusable customer-safe guidance for Jira.

## Jira managed OAuth `Something went wrong` was caused by managed-app scope configuration

This class of Jira managed OAuth failure was tied to Composio's managed Jira OAuth app configuration, especially scope configuration. As a workaround while the managed app was broken, customers could use their own Jira OAuth app/custom credentials. Once the managed app config was fixed, customers could retry the default OAuth flow. Jira/Atlassian also has a maximum of 50 scopes for an OAuth app, so excessive or unsupported scope sets can trigger consent failures.

## Pin custom Jira authConfig when creating Tool Router sessions

When using a custom Jira OAuth app with Tool Router, pass the custom auth config while creating the session. If the session does not specify the Jira auth config, Tool Router can fall back to an auto-generated/default Jira config and fail to see the customer's active custom-auth connections. Pin the active BYOA config, for example `auth_configs: { jira: "<auth_config_id>" }`, so Tool Router resolves the intended Jira connected accounts.

## Jira custom token execution needs the Atlassian base URL/subdomain

For Jira custom-auth execution, include the Atlassian base URL/subdomain along with the access token. Jira expects the tenant URL in the form `https://<subdomain>.atlassian.net`. In Python, pass this through custom auth params such as `base_url`; in the TS SDK, a temporary workaround was to pass `customConnectionData` with `authScheme: "OAUTH2"`, `toolkitSlug: "JIRA"`, `access_token`, and `subdomain`. `JIRA_GET_SERVER_INFO` can help fetch/confirm the base URL.

## Jira search pagination token requires the original JQL or filters

Jira next-page tokens must be used as part of the same search flow and with the same search context that generated the token. In current Jira toolkit behavior, passing only `next_page_token` can fail immediately because the runtime either sends no JQL (`JIRA_SEARCH_FOR_ISSUES_USING_JQL_GET`) or rebuilds a different default JQL (`JIRA_SEARCH_ISSUES`). That can look like token expiry even when the token was consumed seconds after generation.

Workaround:

- For `JIRA_SEARCH_FOR_ISSUES_USING_JQL_GET`, include the original `jql` together with `next_page_token` on every follow-up page.

- For `JIRA_SEARCH_ISSUES`, include the original `jql` or the same original filter inputs, such as `project_key`, `updated_after`, etc., together with `next_page_token`.

- Use the token immediately for the next page.

- Do not persist old tokens or retry rejected tokens. If Jira returns `invalid or expired` even with the same original context, discard the token and restart pagination from page 1.

Customer-safe wording:

```text
We checked the Jira search execution logs and found pagination-token failures. The main thing is to keep the pagination token tied to the same search context that created it: pass the original JQL or the same original filters along with `next_page_token` on every page request.

Also use the token immediately. If Jira still returns `invalid or expired` with the same context, discard that token and restart pagination from page 1.
```

## Jira OAuth redirect URI must match the authConfig and Atlassian app

For Jira/Atlassian OAuth, configure the same redirect URI in both the Composio authConfig and the Atlassian OAuth app. Either supported v1 or v3 redirect URI can be used, but they must match exactly. The valid v3 callback is `https://backend.composio.dev/api/v3/toolkits/auth/callback`; `https://backend.composio.dev/api/v3/auth-apps/add` is not the correct v3 callback.

## Missing `audience=api.atlassian.com` can prevent Jira refresh tokens

Atlassian OAuth 2.0 requires `audience=api.atlassian.com` in the authorization URL. Without this parameter, Atlassian may not honor `offline_access`, meaning no refresh token is returned and the access token expires without being refreshable. If Jira credentials expire immediately, check whether the connected account is missing `offline_access` and whether the Jira OAuth config includes the required `audience` parameter. As an urgent workaround, API key auth with Atlassian email + API token can provide stable non-expiring credentials.

## Use `JIRA_GET_CREATE_METADATA_ISSUE_TYPE_FIELDS` instead of deprecated create metadata behavior

Use `JIRA_GET_CREATE_METADATA_ISSUE_TYPE_FIELDS` for the closest replacement behavior to the deprecated `JIRA_GET_ISSUE_CREATE_METADATA` flow. The replacement was added after Jira deprecated the older create-metadata API behavior.

## Download Jira attachments with `JIRA_GET_ATTACHMENT`

Use `JIRA_GET_ATTACHMENT` to retrieve the binary content of a Jira attachment by attachment ID. This tool is intended for downloading a specific file attached to a Jira issue.

## Composio manages Jira OAuth tokens but does not store Jira API response payloads

Composio manages Jira OAuth access and refresh tokens securely, but does not store Jira API response payloads. Jira API responses flow back to the customer's application when agents call Jira tools through Composio. If the customer's system stores conversation logs or tool outputs, Jira data such as AccountIDs or display names resides in the customer's infrastructure.

## Jira service account use requires customer-owned credentials and scopes

For Jira service-account-style usage, customers should use their own credentials with the required Jira and Jira service-account scopes when no dedicated managed auth app is available for that flow.
