## How do I set up custom OAuth credentials for Jira?


For a step-by-step guide on creating and configuring your own Jira OAuth credentials with Composio, see [How to create OAuth credentials for Jira](https://composio.dev/auth/jira).

## What is the difference between JQL GET, JQL POST, and Search Issues?


JQL GET and POST target the same search functionality but use different HTTP methods. POST supports complex queries in the request body. Search Issues uses JQL POST under the hood with extra parameters and filters. For consistent results, prefer POST for complex queries. Use the `fields` parameter to request specific fields, or `["*all"]` to request all fields.

---

## Jira OAuth scope configuration errors


For Jira OAuth failures during consent or connection, compare the scopes configured in Composio with the scopes configured on the Atlassian OAuth app. Jira/Atlassian also has a maximum of 50 scopes for an OAuth app, so excessive or unsupported scope sets can trigger consent failures. If the managed app scope set does not match the workflow, use your own Jira OAuth app/custom credentials with the required scopes and reconnect.

## Pin custom Jira auth config when creating Tool Router sessions


When using a custom Jira OAuth app with Tool Router, pass the custom auth config while creating the session. If the session does not specify the Jira auth config, Tool Router can fall back to an auto-generated/default Jira config and fail to see the user's active custom-auth connections. Pin the active BYOA config, for example `auth_configs: { jira: "<auth_config_id>" }`, so Tool Router resolves the intended Jira connected accounts.

## What is needed for Jira custom-token execution?


For Jira custom-auth execution, include the Atlassian base URL/subdomain along with the access token. Jira expects the tenant URL in the form `https://<subdomain>.atlassian.net`. In Python, pass this through custom auth params such as `base_url`. In TypeScript, pass the custom connection data with `authScheme: "OAUTH2"`, `toolkitSlug: "JIRA"`, `access_token`, and `subdomain`. `JIRA_GET_SERVER_INFO` can help fetch/confirm the base URL.

## What should the Jira OAuth redirect URI match?


For Jira/Atlassian OAuth, configure the same redirect URI in both the Composio authConfig and the Atlassian OAuth app. Either supported v1 or v3 redirect URI can be used, but they must match exactly. The valid v3 callback is `https://backend.composio.dev/api/v3/toolkits/auth/callback`; `https://backend.composio.dev/api/v3/auth-apps/add` is not the correct v3 callback.

## Missing `audience=api.atlassian.com` can prevent Jira refresh tokens


Atlassian OAuth 2.0 requires `audience=api.atlassian.com` in the authorization URL. Without this parameter, Atlassian may not honor `offline_access`, meaning no refresh token is returned and the access token expires without being refreshable. If Jira credentials expire immediately, check whether the connected account is missing `offline_access` and whether the Jira OAuth config includes the required `audience` parameter. API key auth with Atlassian email + API token can provide stable non-expiring credentials when that fits the workflow.

## Composio manages Jira OAuth tokens but does not store Jira API response payloads


Composio manages Jira OAuth access and refresh tokens securely, but does not store Jira API response payloads. Jira API responses flow back to the user's application when agents call Jira tools through Composio. If the user's system stores conversation logs or tool outputs, Jira data such as AccountIDs or display names resides in the user's infrastructure.

## What is required for Jira service-account usage?


For Jira service account style usage, users should use their own credentials with the required Jira and Jira service-account scopes. Composio does not provide a managed auth app specifically for that service-account use case.
