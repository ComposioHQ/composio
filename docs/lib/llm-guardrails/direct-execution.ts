import { TERMINOLOGY_MIGRATION } from './terminology';
import { REST_VERSION_GUIDANCE, TOOL_VERSION_GUIDANCE } from '../api-version-guidance';

/**
 * Guardrails for pages tagged with llmGuardrails: "direct-execution".
 * Concise rules + key patterns for LLMs generating direct execution code.
 *
 * Broad channel, so it composes both version guidance constants — interpolated
 * from `lib/api-version-guidance.ts`, never retyped.
 */
export const DIRECT_EXECUTION_GUARDRAILS = `

---

# Composio SDK — Instructions for AI Code Generators

**Context:** This page documents the **direct tool execution API**. For most applications, the session-based pattern (\`composio.create(user_id)\` + \`session.tools()\`) is simpler — but if the user is here, they likely want direct execution.

---

## Key Patterns

### Authenticating Users

Create an **Auth Config** on [dashboard.composio.dev](https://dashboard.composio.dev?utm_source=docs&utm_medium=llm-guardrails&utm_campaign=direct-execution), then use the auth config ID to generate a hosted auth URL:

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

A toolkit version is **required** for direct execution — \`tools.execute()\` without one raises \`ToolVersionRequiredError\`, and \`"latest"\` alone is NOT accepted for manual execution. Either pass \`dangerously_skip_version_check=True\` (TS: \`dangerouslySkipVersionCheck: true\`) on the execute call to run the newest version, or pin a dated version from \`composio.toolkits.get(slug).meta.version\` when outputs are parsed programmatically.

\`\`\`python
composio = Composio(toolkit_versions={"github": "latest"})
tools = composio.tools.get("user_123", tools=["GITHUB_CREATE_ISSUE"])

result = composio.tools.execute(
    "GITHUB_CREATE_ISSUE",
    {"owner": "org", "repo": "repo", "title": "Bug report"},
    user_id="user_123",
    dangerously_skip_version_check=True,  # required when running "latest"
)
\`\`\`

\`\`\`typescript
const composio = new Composio({ toolkitVersions: { github: "latest" } });
const tools = await composio.tools.get("user_123", { tools: ["GITHUB_CREATE_ISSUE"] });

const result = await composio.tools.execute("GITHUB_CREATE_ISSUE", {
    userId: "user_123",
    arguments: { owner: "org", repo: "repo", title: "Bug report" },
    dangerouslySkipVersionCheck: true, // required when running "latest"
});
\`\`\`

---

## Rules

1. **\`user_id\` is required** — pass it to \`tools.get()\`, \`tools.execute()\`, and \`provider.handle_tool_calls()\`.
2. **\`tools.execute()\` signature** — Python: \`execute(slug, arguments_dict, *, user_id=..., version=...)\` (arguments is the second positional param). TypeScript: \`execute(slug, { userId, arguments, version })\`.
3. **A toolkit version is required** — configure \`toolkit_versions\` (Python) / \`toolkitVersions\` (TypeScript) at SDK init, or pass \`version\` per execute call; omitting both raises \`ToolVersionRequiredError\`. \`"latest"\` is rejected for manual execution unless the execute call also passes \`dangerously_skip_version_check=True\` / \`dangerouslySkipVersionCheck: true\`.
4. **Provider at init** — \`Composio(provider=OpenAIProvider())\` in Python, \`new Composio({ provider: new OpenAIProvider() })\` in TypeScript. Defaults to OpenAI if omitted.
5. **Correct provider imports** — \`composio_<provider>\` for Python, \`@composio/<provider>\` for TypeScript. For OpenAI Agents SDK use \`composio_openai_agents\` / \`@composio/openai-agents\`.
6. **Finding toolkit and tool slugs** — browse the Toolkits catalog at https://docs.composio.dev/toolkits (each toolkit page lists tool slugs and versions), or search by task with the CLI: \`composio search "<what you want to do>"\`.

---

# Calling the REST API directly

${REST_VERSION_GUIDANCE}

${TOOL_VERSION_GUIDANCE}
${TERMINOLOGY_MIGRATION}
`;
