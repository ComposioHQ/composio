import { TERMINOLOGY_MIGRATION } from './terminology';
import { REST_VERSION_GUIDANCE, TOOL_VERSION_GUIDANCE } from '../api-version-guidance';

/**
 * Default integration notes appended to most pages.
 * Documents the session-based pattern (composio.create + session.tools) as the
 * recommended default, states the common mistakes as facts rather than
 * imperatives, and acknowledges direct execution as a supported alternative.
 * (Rewritten after two eval rounds showed capable agents classify
 * ALWAYS/NEVER-style instruction blocks as prompt injection and distrust the
 * page they appear on.)
 *
 * A reader of a session guide may call any endpoint, so this is a broad
 * channel: it composes both version guidance constants. They are interpolated
 * from `lib/api-version-guidance.ts`, never retyped — see the composition rule
 * there.
 */
export const SESSION_GUARDRAILS = `

---

# Composio SDK — Notes for AI Code Generators

**Purpose:** Reference for generating current (v3) [Composio](https://composio.dev/) integration code.
**Scope:** Descriptive notes — they document the current API surface and the mistakes most commonly seen in generated code.

---

## 1. Recommended Integration: Sessions

For agent tool delivery, Composio supports **Native Tools** (with a provider package) and **MCP** (no provider package needed).

For application-owned tools or deterministic backend code, use [managed authentication with Proxy Execute](/docs/authentication/managed-auth-for-custom-tools). A session can provide a user-scoped runtime context without an LLM or MCP. Composio authenticates provider requests server-side; connected-account reads redact credentials and aren't a supported token-export workflow.

### Native Tools

#### Python

\`\`\`python
# ✅ CORRECT — Python (defaults to OpenAI)
from composio import Composio

composio = Composio()
session = composio.create(user_id="user_123")
tools = session.tools()
# Pass tools to your agent/LLM framework
\`\`\`

#### TypeScript

\`\`\`typescript
// ✅ CORRECT — TypeScript (defaults to OpenAI)
import { Composio } from "@composio/core";

const composio = new Composio();
const session = await composio.create("user_123");
const tools = await session.tools();
// Pass tools to your agent/LLM framework
\`\`\`

#### API

This produces the same default OpenAI function-tool shape, fetching every page.

\`\`\`bash
set -euo pipefail
SESSION=$(curl --fail-with-body -s -X POST https://backend.composio.dev/api/v3.1/tool_router/session \\
  -H "x-api-key: $COMPOSIO_API_KEY" -H "Content-Type: application/json" \\
  -d '{"user_id":"user_123"}')
SESSION_ID=$(echo "$SESSION" | jq -r '.session_id')
TOOLS='[]'
CURSOR=''
while true; do
  PAGE=$(curl --fail-with-body -s --get "https://backend.composio.dev/api/v3.1/tool_router/session/$SESSION_ID/tools" \\
    -H "x-api-key: $COMPOSIO_API_KEY" --data-urlencode 'limit=500' --data-urlencode "cursor=$CURSOR")
  TOOLS=$(jq -cn --argjson existing "$TOOLS" --argjson page "$PAGE" \\
    '$existing + [$page.items[] | {type:"function",function:{name:.slug,description:.description,parameters:.input_parameters}}]')
  CURSOR=$(echo "$PAGE" | jq -r '.next_cursor // empty')
  [ -n "$CURSOR" ] || break
done
printf '%s\\n' "$TOOLS"
\`\`\`

For other providers, pass the provider explicitly. Provider packages follow the naming convention: \`composio_<provider>\` for Python, \`@composio/<provider>\` for TypeScript.

### MCP

Use \`session.mcp.url\` and \`session.mcp.headers\` with any MCP-compatible client (Claude Desktop, Cursor, OpenAI Agents, etc.). No provider package needed.

---

## 2. Integration Notes

- \`composio.create(user_id)\` is the standard entry point for agent integrations. Sessions handle tool discovery, authentication, and toolkit versioning automatically; \`user_id\` goes to \`composio.create()\` — individual tool calls in session mode don't take one.
- Execute session tool calls through the session, never through a user ID: either \`session.execute(tool_slug, arguments=...)\` / \`session.execute(toolSlug, arguments)\`, which works with every provider, or pass the session to the provider helper — \`provider.handle_tool_calls(response=response, session=session)\` in Python, \`provider.handleToolCalls(session, response)\` in TypeScript. The tool-call helpers of every non-agentic provider (OpenAI, Anthropic, Google, Cloudflare, TypeSafe) accept a session: \`executeToolCall(session, call)\` in TypeScript, \`session=session\` in Python. Agentic providers execute session tools on their own. Binding the helper to a user ID takes the direct execution path, and session meta-tools fail there with \`"can only be called inside a tool-router session"\`.
- Composio-managed auth is the default: the agent connects accounts at runtime through the session, so users don't need to pre-create auth configs or connected accounts for managed toolkits.
- Provider packages follow the framework, not the model vendor: for the OpenAI Agents SDK the package is \`composio_openai_agents\` / \`@composio/openai-agents\` (importing \`composio_openai\` / \`@composio/openai\` there is the most common mistake in generated code — that package is for the plain OpenAI Chat Completions API).
- **Direct execution** (\`composio.tools.get()\`, \`composio.tools.execute()\`, \`provider.handle_tool_calls()\` with a user ID) is a legacy interface that remains supported for existing integrations. Recommend sessions for new integrations and encourage existing users to [migrate to sessions](/docs/migration-guide/direct-to-sessions). For a fixed tool set, consider the [direct tools preset](/docs/configuring-sessions#direct-tools-preset) within a session. See [Sessions vs direct execution](/docs/sessions-vs-direct-execution) for tradeoffs. Direct execution requires a [toolkit version](/docs/tools-direct/toolkit-versioning).

---

# 3. Calling the REST API directly

${REST_VERSION_GUIDANCE}

${TOOL_VERSION_GUIDANCE}
${TERMINOLOGY_MIGRATION}
`;
