## Why does Reddit report an invalid client ID before consent?

Check whether the auth config uses Composio-managed credentials or your own Reddit app. For custom OAuth, verify the app's client ID, secret, registered callback, and approval for the intended access. Match the callback to the auth config's `oauth_redirect_uri`; the toolkit defaults to `https://backend.composio.dev/api/v1/auth-apps/add`.

For managed OAuth, you can't repair Composio's provider app by editing your own Reddit developer settings. Start a fresh connection through [hosted authentication](/docs/authentication/manually-authenticating). Managed OAuth uses Connect Link or session authorization; its legacy `initiate()` path has been retired. See [Migrating from initiate to link](/docs/auth-configuration/migrating-initiate-to-link).

If managed OAuth still fails before consent, contact [support@composio.dev](mailto:support@composio.dev) with the auth config ID, its age, UTC timestamp, and redacted provider error. A failure before consent can require a provider or Composio fix.

## Should I recreate a stale managed Reddit auth config?

Ask support to confirm whether the config references outdated managed credentials before replacing it. Recreating a config isn't a validated general fix for an invalid client ID.

Deleting an auth config is permanent and prevents its dependent connected accounts from functioning. Before any migration, inventory those accounts and the sessions or application settings that reference the config. Validate a replacement with a test connection, then plan updates and any required reauthorization with support. Keep the existing config until that migration is verified.

## Why does Reddit authorization fail from my MCP client?

If you're using an old Reddit-specific MCP URL, follow [Composio Connect setup](/docs/composio-connect) with `https://connect.composio.dev/mcp` and the authentication method for your client. Session-based applications should use their returned [session MCP URL and headers](/docs/sessions-via-mcp).

If MCP connects but Reddit rejects the OAuth request, use the invalid-client checks above. If the failure happens while connecting the MCP client itself, use [generic connection troubleshooting](/docs/oauth-mcp-troubleshooting). Redact tokens, authorization codes, secrets, and OAuth `state` values from any logs you share.
