Use these checks to troubleshoot Composio MCP connection failures in Hermes / Nous Hermes Agent.

## Production MCP API paths and direct transport tests

Use HTTPS and the full production API path:

```text
https://backend.composio.dev/api/v3.1/mcp/servers
https://backend.composio.dev/api/v3.1/mcp/<mcp_server_id>
```

Pass the Project API key in `x-api-key`. Avoid an HTTP URL, staging hosts, or a trailing slash on `/servers`, which can produce redirects. For a no-auth server, still pass `auth_config_ids: []` explicitly with `no_auth_apps`.

When testing the returned MCP transport directly, include the Project API key, either `user_id` or `connected_account_id`, and `Accept: application/json, text/event-stream`. A redirect from the returned URL to the current Streamable HTTP endpoint is expected when the client follows it.

## Auth configs are project-scoped

A hosted For You/consumer MCP session cannot reuse a custom auth config created in a separate Platform developer project. The session resolves configs only in its own project.

For a customer-created Platform Tool Router session, bind a same-project config with its real `ac_*` ID. A display name is not the auth-config ID, and cross-project binding is unsupported.
