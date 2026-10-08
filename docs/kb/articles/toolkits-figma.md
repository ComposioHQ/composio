Use this guide to configure Figma authentication, discover available tools, and work with design tokens and components.

## Configure Figma authentication for production

**Let Composio handle Bearer authorization.** For Figma, customers can provide the supported credentials/token through the toolkit's auth mode, and Composio handles the Bearer authorization header internally. They should not need to manually create a separate Bearer-token auth scheme for normal Figma tool use.

**Use customer-owned credentials for production rate limits.** If Figma returns 429, verify the response is coming from Figma and review Figma's rate-limit docs. Composio's default Figma app is fine for testing, but production use should use the customer's own Figma credentials to avoid shared-app pressure and to control scopes/rate limits.

**Remove deprecated scopes before reconnecting.** If a Figma auth config contains the deprecated `file_read` scope, remove it and initiate a new connection.

## Discover and run Figma tools across auth modes

Figma tools should be usable regardless of whether the connection uses Composio-managed OAuth, a custom OAuth app, or token/API-key auth. If you cannot find a tool, fetch available tools dynamically and check the auth scopes required by that tool.

## Work with Figma design tokens and components

**Check plan access when extracting variables.** Some Figma API features are plan-limited. If `FIGMA_EXTRACT_DESIGN_TOKENS` fails when `include_variables` is enabled, verify your Figma plan/API access. As a workaround, set `include_variables` to false.

**Use current design-token and component actions.** For Figma design-token and component workflows, use `FIGMA_EXTRACT_DESIGN_TOKENS`, `FIGMA_DESIGN_TOKENS_TO_TAILWIND`, and `FIGMA_GET_FILE_NODES`. The older `FIGMA_GET_COMPONENT` action is deprecated. If a needed Figma tool is missing, submit it through the Composio request portal.
