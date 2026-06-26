## How do I set up custom OAuth credentials for Jira?

For a step-by-step guide on creating and configuring your own Jira OAuth credentials with Composio, see [How to create OAuth credentials for Jira](https://composio.dev/auth/jira).

## What is the difference between JQL GET, JQL POST, and Search Issues?

JQL GET and POST target the same search functionality but use different HTTP methods. POST supports complex queries in the request body. Search Issues uses JQL POST under the hood with extra parameters and filters. For consistent results, prefer POST for complex queries. Use the `fields` parameter to request specific fields, or `["*all"]` to request all fields.

---

## How should I handle jira managed OAuth `Something went wrong` was caused by managed-app scope configuration?

This class of Jira managed OAuth failure was tied to Composio's managed Jira OAuth app configuration, especially scope configuration. As a workaround while the managed app was broken, users could use their own Jira OAuth app/custom credentials. Once the managed app config was fixed, users could retry the default OAuth flow. Jira/Atlassian also has a maximum of 50 scopes for an OAuth app, so excessive or unsupported scope sets can trigger consent failures.

## How should I handle pin custom Jira authConfig when creating Tool Router sessions?

When using a custom Jira OAuth app with Tool Router, pass the custom auth config while creating the session. If the session does not specify the Jira auth config, Tool Router can fall back to an auto-generated/default Jira config and fail to see the user's active custom-auth connections. Pin the active BYOA config, for example `auth_configs: { jira: "<auth_config_id>" }`, so Tool Router resolves the intended Jira connected accounts.

## What does Jira custom token execution need?

For Jira custom-auth execution, include the Atlassian base URL/subdomain along with the access token. Jira expects the tenant URL in the form `https://<subdomain>.atlassian.net`. In Python, pass this through custom auth params such as `base_url`; in the TS SDK, a temporary workaround was to pass `customConnectionData` with `authScheme: "OAUTH2"`, `toolkitSlug: "JIRA"`, `access_token`, and `subdomain`. `JIRA_GET_SERVER_INFO` can help fetch/confirm the base URL.

## What does Jira search pagination token require?

Jira next-page tokens must be used as part of the same search flow and with the same search context that generated the token. In current Jira toolkit behavior, passing only `next_page_token` can fail immediately because the runtime either sends no JQL (`JIRA_SEARCH_FOR_ISSUES_USING_JQL_GET`) or rebuilds a different default JQL (`JIRA_SEARCH_ISSUES`). That can look like token expiry even when the token was consumed seconds after generation.

Workaround:

- For `JIRA_SEARCH_FOR_ISSUES_USING_JQL_GET`, include the original `jql` together with `next_page_token` on every follow-up page.
- For `JIRA_SEARCH_ISSUES`, include the original `jql` or the same original filter inputs, such as `project_key`, `updated_after`, etc., together with `next_page_token`.
- Use the token immediately for the next page.
- Do not persist old tokens or retry rejected tokens. If Jira returns `invalid or expired` even with the same original context, discard the token and restart pagination from page 1.

Support troubleshooting steps:

1. Ask for the initial search log ID that returned the token and the follow-up log ID that failed.
2. Compare the provider request payloads in logs.
3. If the failed follow-up omitted the original JQL/filters or shows a different JQL than the first request, tell the user to preserve the same search context with each token request.
4. If the same JQL/filters were preserved and the token still failed immediately, treat it as a real invalid/stale token and escalate with both logs if it repeats.

We checked the Jira search execution logs and found pagination-token failures. The main thing is to keep the pagination token tied to the same search context that created it: pass the original JQL or the same original filters along with `next_page_token` on every page request.

Also use the token immediately. If Jira still returns `invalid or expired` with the same context, discard that token and restart pagination from page 1.

## What must Jira OAuth redirect URI do?

For Jira/Atlassian OAuth, configure the same redirect URI in both the Composio authConfig and the Atlassian OAuth app. Either supported v1 or v3 redirect URI can be used, but they must match exactly. The valid v3 callback is `https://backend.composio.dev/api/v3/toolkits/auth/callback`; `https://backend.composio.dev/api/v3/auth-apps/add` is not the correct v3 callback.

## How should I handle missing `audience=api.atlassian.com` can prevent Jira refresh tokens?

Atlassian OAuth 2.0 requires `audience=api.atlassian.com` in the authorization URL. Without this parameter, Atlassian may not honor `offline_access`, meaning no refresh token is returned and the access token expires without being refreshable. If Jira credentials expire immediately, check whether the connected account is missing `offline_access` and whether the Jira OAuth config includes the required `audience` parameter. As an urgent workaround, API key auth with Atlassian email + API token can provide stable non-expiring credentials.

## When should I use `JIRA_GET_CREATE_METADATA_ISSUE_TYPE_FIELDS` instead of deprecated create metadata behavior?

Use `JIRA_GET_CREATE_METADATA_ISSUE_TYPE_FIELDS` for the closest replacement behavior to the deprecated `JIRA_GET_ISSUE_CREATE_METADATA` flow. The replacement was added after Jira deprecated the older create-metadata API behavior.

## How should I handle download Jira attachments with `JIRA_GET_ATTACHMENT`?

Use `JIRA_GET_ATTACHMENT` to retrieve the binary content of a Jira attachment by attachment ID. This tool is intended for downloading a specific file attached to a Jira issue.

## What does Self-hosted Jira require?

For self-hosted Jira, configure the connection with the user's self-hosted subdomain during setup. If the correct subdomain/base URL is supplied, the connection setup should work like other Jira configurations.

## How should I handle composio manages Jira OAuth tokens but does not store Jira API response payloads?

Composio manages Jira OAuth access and refresh tokens securely, but does not store Jira API response payloads. Jira API responses flow back to the user's application when agents call Jira tools through Composio. If the user's system stores conversation logs or tool outputs, Jira data such as AccountIDs or display names resides in the user's infrastructure.

## What does Jira service account use require?

For Jira service account style usage, users should use their own credentials with the required Jira and Jira service-account scopes. Composio does not provide a managed auth app specifically for that service-account use case.
