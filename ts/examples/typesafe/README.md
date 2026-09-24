# TypeSafe (Jev) Example

Jev picks a Composio tool from a plain-language request, binds the arguments it can, and tells you how sure it is. This example decides between three Hacker News tools, completes the partial call, and executes it.

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

   - `COMPOSIO_API_KEY`: Get it from the [Composio Dashboard](https://dashboard.composio.dev/settings)
   - `TYPESAFE_API_KEY`: Get it from [TypeSafe](https://typesafe.ai)

The example stops with an error that names the missing variable when a key is not set. It needs Node.js 24.17 or newer, the same as `@composio/typesafe`.

## Running the Example

```bash
# Decide, complete the partial call, and execute
pnpm start

# Companion flow: shortlist tools for another provider
pnpm start:shortlist
```

## What `pnpm start` does

1. `composio.tools.get()` compiles three Hacker News tools into Jev questions. This step is offline.
2. `provider.decide()` asks Jev which tool carries out the request and prints the decision.
3. Jev never writes free text, so the `username` argument comes back in `missing`. The example supplies it as a caller argument.
4. `provider.execute()` runs the completed call.

The example executes a decision only when its `risk` is `read_only`, because your Composio key points at real accounts.

## Reading the decision

- `confidence` is the score of the least certain judgement the call depends on. It is not a calibrated probability that the whole call is correct.
- A destructive tool routes at a threshold of 0.9 and needs `confirm: true` in `execute`.
- State can be `{ request, context }`. Routing and the action gate see `request` only, so text in `context` cannot change which tool is picked. Argument questions may see `context`. `contextScope: 'all'` opts out of that separation.
- When you use `confidenceGate`, create one gate per agent run and reuse it across that run's retries. Create a fresh gate for each new run.

## What `pnpm start:shortlist` does

`shortlistTools` ranks every Hacker News tool against the request in one call and keeps the top three. The example then re-fetches those three through `OpenAIProvider`, which is what you would hand to the LLM.

## Related Examples

- [Google Example](../google) - Shows integration with Google GenAI
- [OpenAI Example](../openai) - Shows integration with OpenAI
- [More Examples](../) - Browse all available examples

## Support

- [Documentation](https://docs.composio.dev)
- [Discord Community](https://discord.gg/composio)
- [GitHub Issues](https://github.com/ComposioHQ/composio/issues)
