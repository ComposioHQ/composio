## Why can `FIGMA_EXTRACT_DESIGN_TOKENS` fail when `include_variables` is enabled?

When `include_variables` is enabled, the tool calls Figma's local variables endpoint and the connected account must have the `file_variables:read` scope. If Figma returns a 403 saying the endpoint requires `file_variables:read`, reconnect with Figma credentials that can grant that scope. Figma exposes this scope only for Enterprise organization members.

If you do not need Figma variables, set `include_variables` to `false`. The tool can still extract tokens from local styles and nodes without calling the variables endpoint.

## What can cause Figma 429s?

A 429 means Figma rate limited the request. Confirm the response is coming from Figma, reduce request volume, add backoff, and retry after the provider limit resets.

Default Figma auth is useful for quick testing. For production traffic, use your own Figma credentials so your app controls its scopes, traffic pattern, and rate-limit exposure.
