# Session-management Example

This example demonstrates how to use Composio SDK for session-management.

## Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   
   Then edit `.env` and add your API keys:
   - `COMPOSIO_API_KEY`: Get it from [Composio Dashboard](https://app.composio.dev)

## Running the Example

```bash
# Run the example
pnpm start

# Run in development mode (with file watching)
pnpm dev
```

## What This Example Does

- Initializes Composio SDK
- Fetches available tools
- Demonstrates basic usage patterns

## Verifying saved Session configs

`src/session-configs.ts` checks saved Session configs against a real project. It creates sessions, prints `PASS` or `FAIL` for each check, deletes the sessions it created, and exits non-zero on any failure. It never runs as part of `pnpm start`.

```bash
COMPOSIO_API_KEY=... \
SESSION_CONFIG_ID=sc_... \
ARCHIVED_SESSION_CONFIG_ID=sc_... \
COMPOSIO_API_KEY_NO_FEATURE=... \
pnpm start:session-configs
```

`COMPOSIO_API_KEY` must belong to a project with Session configs enabled, with one active and one archived config. `COMPOSIO_API_KEY_NO_FEATURE` is optional and belongs to a project without the feature, for the `403` check. The script also records whether `sessionPreset: SessionPreset.DIRECT_TOOLS` works with a saved config.

## Customization

Edit `src/index.ts` to:
- Add specific apps you want to integrate with
- Implement your business logic
- Add error handling and logging

## Related Examples

- [OpenAI Example](../openai) - Shows integration with OpenAI
- [LangChain Example](../langchain) - Shows integration with LangChain
- [More Examples](../) - Browse all available examples

## Support

- [Documentation](https://docs.composio.dev)
- [Discord Community](https://discord.gg/composio)
- [GitHub Issues](https://github.com/ComposioHQ/composio/issues)
