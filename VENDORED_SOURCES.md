# Upstream provider sources

The provider SDK repositories below are pinned as read-only git submodules. They give maintainers and coding agents the full repository content each upstream publishes for checking native tool types, execution contracts, and framework behavior. Composio packages must not import or build against these trees.

These sources are opt-in. A normal `git clone` does not download submodules, and every provider-source submodule recommends a depth-1 clone. The checkout still contains every file at the pinned commit; only older history is omitted.

Initialize one source when working on its wrapper:

```bash
git submodule update --init -- ts/vendor/providers/mastra
git submodule update --init -- python/vendor/providers/openai-agents-python
```

Initialize every source for one SDK:

```bash
git submodule update --init -- ts/vendor/providers
git submodule update --init -- python/vendor/providers
```

Avoid `git clone --recurse-submodules` when you do not need the reference sources. To advance a pin to the configured upstream branch, use `git submodule update --remote -- <path>`, review the upstream change, and stage the resulting gitlink.

## TypeScript

| Composio integration                  | Native package                          | Source                                            |
| ------------------------------------- | --------------------------------------- | ------------------------------------------------- |
| `@composio/anthropic`                 | `@anthropic-ai/sdk`                     | `ts/vendor/providers/anthropic-sdk-typescript`    |
| `@composio/claude-agent-sdk`          | `@anthropic-ai/claude-agent-sdk`        | `ts/vendor/providers/claude-agent-sdk-typescript` |
| `@composio/cloudflare`                | `@cloudflare/workers-types`             | `ts/vendor/providers/workerd`                     |
| `@composio/google`                    | `@google/genai`                         | `ts/vendor/providers/js-genai`                    |
| `@composio/langchain`                 | `@langchain/core`                       | `ts/vendor/providers/langchainjs`                 |
| `@composio/llamaindex`                | `llamaindex`                            | `ts/vendor/providers/llamaindex-ts`               |
| `@composio/mastra`                    | `@mastra/core`, `@mastra/schema-compat` | `ts/vendor/providers/mastra`                      |
| `@composio/openai-agents`             | `@openai/agents`                        | `ts/vendor/providers/openai-agents-js`            |
| `@composio/openai`                    | `openai`                                | `ts/vendor/providers/openai-node`                 |
| `@composio/vercel`                    | `ai`                                    | `ts/vendor/providers/vercel-ai`                   |
| `@composio/experimental` Pi provider  | `@earendil-works/pi-coding-agent`       | `ts/vendor/providers/pi`                          |
| `@composio/experimental` Eve provider | `eve`                                   | `ts/vendor/providers/eve`                         |

The official TypeScript Claude Agent SDK repository currently publishes documentation, changelogs, and examples, but not the package implementation. Its submodule contains everything Anthropic makes available there.

## Python

| Composio integration        | Native package            | Source                                            |
| --------------------------- | ------------------------- | ------------------------------------------------- |
| `composio-anthropic`        | `anthropic`               | `python/vendor/providers/anthropic-sdk-python`    |
| `composio-autogen`          | `ag2`                     | `python/vendor/providers/ag2`                     |
| `composio-autogen`          | `autogen-core`            | `python/vendor/providers/autogen`                 |
| `composio-claude-agent-sdk` | `claude-agent-sdk`        | `python/vendor/providers/claude-agent-sdk-python` |
| `composio-crewai`           | `crewai`                  | `python/vendor/providers/crewai`                  |
| `composio-gemini`           | `google-genai`            | `python/vendor/providers/python-genai`            |
| `composio-google`           | `google-cloud-aiplatform` | `python/vendor/providers/python-aiplatform`       |
| `composio-google-adk`       | `google-adk`              | `python/vendor/providers/google-adk`              |
| `composio-langchain`        | `langchain`               | `python/vendor/providers/langchain`               |
| `composio-langgraph`        | `langgraph`               | `python/vendor/providers/langgraph`               |
| `composio-llamaindex`       | `llama-index`             | `python/vendor/providers/llama-index`             |
| `composio-openai`           | `openai`                  | `python/vendor/providers/openai-python`           |
| `composio-openai-agents`    | `openai-agents`           | `python/vendor/providers/openai-agents-python`    |
