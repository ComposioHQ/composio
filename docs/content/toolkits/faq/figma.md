## Do users need to manually add a Bearer auth header for Figma?

For Figma, users can provide the supported credentials/token through the toolkit's auth mode, and Composio handles the Bearer authorization header internally. They should not need to manually create a separate Bearer-token auth scheme for normal Figma tool use.

## `FIGMA_EXTRACT_DESIGN_TOKENS` variables may be limited by the user's Figma plan

Some Figma API features are plan-limited. If `FIGMA_EXTRACT_DESIGN_TOKENS` fails when `include_variables` is enabled, verify the user's Figma plan/API access. If variable extraction is not available, set `include_variables` to false.

## What can cause Figma 429s?

If Figma returns 429, verify the response is coming from Figma and review Figma's rate-limit docs. Composio's default Figma app is fine for testing, but production use should use the user's own Figma credentials to avoid shared-app pressure and to control scopes/rate limits.
