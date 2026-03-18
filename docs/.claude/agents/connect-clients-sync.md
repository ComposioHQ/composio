# Connect Clients Sync

Syncs AI client definitions from the dashboard repo (`ComposioHQ/composio_dashboard`) to the Composio Connect docs page.

## When This Runs

Triggered by `repository_dispatch` from dashboard production deploys, or manually via `workflow_dispatch`. Creates a PR if client definitions have changed.

## Source of Truth

The dashboard repo's client definitions file:
```
ComposioHQ/composio_dashboard
src/app/(connect)/[org]/~/connect/clients/_components/client-definitions.ts
```

This file contains the `ALL_CLIENTS` array with every client's:
- `id`, `name`, `description`, `icon`, `category`
- `authMethods` with step-by-step setup instructions
- Auth types: `oauth` and/or `api-key`

## Target File

```
docs/content/docs/composio-connect.mdx
```

## Process

1. Fetch `client-definitions.ts` from `ComposioHQ/composio_dashboard` (main branch) using the GitHub API
2. Read the current `docs/content/docs/composio-connect.mdx`
3. Compare the client list, categories, and setup steps
4. If there are differences, update `composio-connect.mdx` to match the dashboard

## MDX Structure

The page uses `<ConnectFlow>` and `<ConnectClientOption>` components:

```mdx
<ConnectFlow>

<ConnectClientOption id="client-id" name="Client Name" description="..." icon="/images/clients/logo.svg" category="popular|ide|other">

<Steps>
<Step>
<StepTitle>Step title</StepTitle>

Step description.

</Step>
</Steps>

</ConnectClientOption>

</ConnectFlow>
```

### Category Mapping

Only these 4 clients should have `category="popular"` (shown as tabs):
- `claude-code`
- `codex`
- `openclaw`
- `claude-desktop`

All other clients go in the dropdown:
- Dashboard `IDEs` category → `category="ide"`
- Everything else → `category="other"`

### Auth Method Selection

Show **all auth methods** from the dashboard. When a client has both OAuth and API key methods, use `<Tabs>` to let the user choose:

```mdx
<Tabs items={["OAuth (recommended)", "API Key"]}>
<Tab value="OAuth (recommended)">

<Steps>
<Step>
<StepTitle>Step title</StepTitle>

OAuth step content.

</Step>
</Steps>

</Tab>
<Tab value="API Key">

<Steps>
<Step>
<StepTitle>Get your API key</StepTitle>

Open the [Composio dashboard](https://dashboard.composio.dev) and click **AI Clients** in the sidebar. Select your client and copy your API key.

</Step>
<Step>
<StepTitle>Step title</StepTitle>

API key step content.

</Step>
</Steps>

</Tab>
</Tabs>
```

For clients with only one auth method (OAuth-only like Claude Desktop/ChatGPT, or API-key-only like n8n), use `<Steps>` directly without `<Tabs>`.

For API key methods, always prepend this step before the client-specific steps:

```mdx
<Step>
<StepTitle>Get your API key</StepTitle>

Open the [Composio dashboard](https://dashboard.composio.dev) and click **AI Clients** in the sidebar. Select your client and copy your API key.

</Step>
```

Use the tab labels from the dashboard's `authMethods[].label` field (e.g., "OAuth (recommended)", "API Key").

### Code Blocks

- Use `YOUR_API_KEY` as the placeholder (not the `${token}` variable from the dashboard)
- Use `https://connect.composio.dev/mcp` as the MCP URL (not the `${MCP_URL}` variable)
- Detect the correct language: `bash` for CLI commands, `toml` for TOML config, `json` for JSON config, `text` for plain text/prompts
- Include the `title` attribute from the dashboard's `label` field when present

### Client Logos

Client logos live in `docs/public/images/clients/`. When syncing, **always check for new or updated logos**:

1. Fetch the logo file list from the dashboard repo's `public/images/clients/` and `public/images/logos/` directories using the GitHub API
2. For each client in the definitions, check if its logo already exists in `docs/public/images/clients/`
3. If a logo is missing or has been updated, download it from the dashboard repo and save it to `docs/public/images/clients/`
4. For clients that need dark mode variants (white-on-dark icons), check if a `-dark` variant exists in the dashboard. If not, check if the existing icon works on dark backgrounds. If it doesn't, create a dark variant by changing fills to white
5. Reference logos as `/images/clients/filename.ext` in the MDX, and use `iconDark` prop when a dark variant is available

The dashboard stores logos at:
- `public/images/clients/` (primary location)
- `public/images/logos/` (fallback location)

### Client Order

Popular tab clients come first (in the order listed above), then other clients in the order they appear in the dashboard's `ALL_CLIENTS` array.

## What NOT to Change

- Do NOT modify the frontmatter (title, description) unless new clients need to be added to keywords
- Do NOT modify the intro text ("Give any AI agent...")
- Do NOT modify the "Connect your apps" section at the bottom
- Do NOT modify `connect-flow.tsx` or other component files
- Do NOT modify `source.ts` or `mdx-components.tsx`

## Rules

- Only modify `docs/content/docs/composio-connect.mdx` and files in `docs/public/images/clients/`
- Match the exact step text from the dashboard (resolve template variables like `${MCP_URL}` and `${token}`)
- If a client has `comingSoon: true` in the dashboard, skip it
- If no changes are needed, make no file changes
- Keep the `keywords` frontmatter array updated with all client names (lowercase)
