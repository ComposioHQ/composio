## OneNote uses a customer-owned Microsoft OAuth app

The current `onenote` toolkit supports OAuth2 and requires a client ID and
client secret from a Microsoft Entra app registration. Enter the app's
Application (client) ID and the secret **value**, not the secret's identifier.
Register the exact redirect URI shown by the current Composio auth-config flow.

Choose the least-privileged delegated Microsoft Graph permissions that cover
the intended OneNote actions. Common permissions include `Notes.Read`,
`Notes.Create`, `Notes.ReadWrite`, and the corresponding `*.All` permissions
for notebooks available through groups or sites. Include `offline_access` when
the connection needs a refresh token. Microsoft documents the permission set in
its [Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference#notesreadwrite).

Tenant policy or higher-privilege permissions can require administrator
consent. Follow the shared Microsoft OAuth guidance and create a fresh
connection after changing the app's permissions.
