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
