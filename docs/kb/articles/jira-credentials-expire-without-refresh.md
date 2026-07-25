Atlassian OAuth 2.0 requires `audience=api.atlassian.com` in the authorization URL. Without it, Atlassian may not honor `offline_access` — no refresh token is returned, and the access token expires with no way to refresh it.

The symptom is a Jira connection that works immediately after authorization and then expires for good.

## Check both settings

1. Confirm the Jira OAuth config includes the `audience` parameter.
2. Confirm the connected account was created with `offline_access`.

Both have to be right at authorization time, so fixing either one requires a new connection rather than an edit to the existing one.

If you need stable credentials before that work is done, API key auth with an Atlassian email and API token provides non-expiring credentials.
