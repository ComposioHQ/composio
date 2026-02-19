/**
 * Guardrails for pages tagged with llmGuardrails: "direct-execution".
 * Concise rules + key patterns for LLMs generating direct execution code.
 */
export const DIRECT_EXECUTION_GUARDRAILS = `

---

# Composio SDK — Instructions for AI Code Generators

**Context:** This page documents the **direct tool execution API**. For most applications, the session-based pattern (\`composio.create(user_id)\` + \`session.tools()\`) is simpler — but if the user is here, they likely want direct execution.

---

## Key Patterns

### Authenticating Users

Create an **Auth Config** on [platform.composio.dev](https://platform.composio.dev), then use the auth config ID to generate a hosted auth URL:

\`\`\`python
from composio import Composio

composio = Composio()
connection = composio.connected_accounts.link(
    user_id="user_123",
    auth_config_id="ac_...",  # from platform dashboard
)
print(connection.redirect_url)  # send user here to authenticate
\`\`\`

\`\`\`typescript
import { Composio } from "@composio/core";

const composio = new Composio();
const connection = await composio.connectedAccounts.link("user_123", "ac_...", {
    callbackUrl: "https://your-app.com/callback",
});
console.log(connection.redirectUrl); // send user here to authenticate
\`\`\`

### Executing Tools

\`\`\`python
tools = composio.tools.get("user_123", tools=["GITHUB_CREATE_ISSUE"])

result = composio.tools.execute(
    "GITHUB_CREATE_ISSUE",
    {"owner": "org", "repo": "repo", "title": "Bug report"},
    user_id="user_123",
)
\`\`\`

\`\`\`typescript
const tools = await composio.tools.get("user_123", { tools: ["GITHUB_CREATE_ISSUE"] });

const result = await composio.tools.execute("GITHUB_CREATE_ISSUE", {
    userId: "user_123",
    arguments: { owner: "org", repo: "repo", title: "Bug report" },
});
\`\`\`

---

## Rules

1. **\`user_id\` is required** — pass it to \`tools.get()\`, \`tools.execute()\`, and \`provider.handle_tool_calls()\`.
2. **\`tools.execute()\` signature** — Python: \`execute(slug, arguments_dict, *, user_id=...)\` (arguments is the second positional param). TypeScript: \`execute(slug, { userId, arguments })\`.
3. **Provider at init** — \`Composio(provider=OpenAIProvider())\` in Python, \`new Composio({ provider: new OpenAIProvider() })\` in TypeScript. Defaults to OpenAI if omitted.
4. **Correct provider imports** — \`composio_<provider>\` for Python, \`@composio/<provider>\` for TypeScript. For OpenAI Agents SDK use \`composio_openai_agents\` / \`@composio/openai-agents\`.
`;
