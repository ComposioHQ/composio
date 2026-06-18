# Tool-router Example

This example demonstrates how to use Composio SDK for tool-router.

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
   - `OPENAI_API_KEY`: Required for OpenAI Agents examples
   - `OPENAI_MODEL`: Optional model override for OpenAI Agents examples

## Running the Example

```bash
# Run the example
pnpm start

# Run in development mode (with file watching)
pnpm dev

# Explicit preload for app tools and SDK custom tools
pnpm preload

# Direct-tools preset for sessions where all tools are known upfront
pnpm direct-tools
```

## What This Example Does

- Initializes Composio SDK
- Fetches available tools
- Demonstrates basic usage patterns
- Shows how to preload selected app tools and SDK-local custom tools into `session.tools()`
- Shows `SessionPreset.DIRECT_TOOLS` for loading all tools allowed by session filters without meta/helper tools

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
- [GitHub Issues](https://github.com/composio/composio/issues)
