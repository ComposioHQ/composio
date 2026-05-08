## Why do Notion operations show "Composio" instead of the user's name?

Notion attributes actions to the integration itself, not the individual user. The name and logo shown come from the integration configuration. To use a custom name or logo, create your own Notion integration. See [Notion integration docs](https://developers.notion.com/docs/create-a-notion-integration).

## How do I grant access to more Notion pages?

Open Notion, go to Settings & Members, then Connections. Select the integration (Composio or your custom integration), click "Select pages" or "Manage access", and add or remove pages as needed.

## Does Notion use OAuth scopes?

No. Notion controls access by granting integrations access to specific pages and databases, not through scopes. You don't need to pass scopes when creating an auth config.

## How does Notion's access model work?

Notion grants page and database access per integration (identified by the OAuth `client_id`), not per individual token or per Composio auth config. OAuth apps (public) let users select which pages to share during authorization, and internal integrations (API key) have page access managed in the integration settings.

If you create multiple auth configs that share the same Notion integration credentials, page access is cumulative and shared across all of them. Notion tracks granted pages at the integration level in the workspace's **Settings > Connections**, so any page granted to one connection is accessible by all connections using that same `client_id`.

To achieve isolated page access between separate connections, create distinct Notion integrations at https://www.notion.so/profile/integrations, each with its own `client_id` and secret, and use those separate credentials in separate Composio auth configs.

---
