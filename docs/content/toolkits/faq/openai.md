## Does `OPENAI_CREATE_IMAGE` support `gpt-image-2` in the latest toolkit version?

`gpt-image-2` has been shipped and can be used through `OPENAI_CREATE_IMAGE` on the latest toolkit version. If the model is missing, the user should update the toolkit/tool version before retrying.

## When should I use `OpenAIAgentsProvider` when wiring Composio tools into OpenAI Agents?

For OpenAI Agents, initialize Composio with `OpenAIAgentsProvider`, create a session for the user, fetch tools from the session, and pass those tools into the OpenAI Agent. This is the expected provider path when using the OpenAI Agents SDK with Composio.

## What must Pin auth config and connected account IDs in Tool Router sessions when a specific connection do?

When creating a Tool Router session, pass the desired `authConfigId` and `connectedAccountId` in the session creation options. Use `authConfigs: { [toolkitSlug]: authConfigId }` and `connectedAccounts: { [toolkitSlug]: connectedAccountId }` so the session uses that specific connection instead of relying on discovery/default selection.

## When should I use `beforeExecute` modifiers to add a human approval layer before tool execution?

Composio SDK modifiers can be used to add a gating layer before tool execution. Implement a `beforeExecute` modifier to inspect the tool call, request approval, and only allow the execution to continue when the user's approval logic passes.

## What should I know about Append `session.experimental.assistivePrompt` when GPT models?

If GPT model behavior is flaky during tool execution, append `session.experimental.assistivePrompt` to the agent prompt to improve execution reliability. Use this alongside checking tool-call logs and the model/session configuration.

## How should I handle provider/schema errors with OpenAI integrations?

When troubleshooting provider/schema errors with OpenAI or LangChain-style integrations, upgrade the relevant Composio SDK packages together. Update both core Composio and provider packages to the latest version before retesting.
