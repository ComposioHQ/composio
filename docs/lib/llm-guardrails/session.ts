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

Composio supports two integration modes: **Native Tools** (with a provider package) and **MCP** (no provider package needed).

### Native Tools

\`\`\`python
# ✅ CORRECT — Python (defaults to OpenAI)
from composio import Composio

composio = Composio()
session = composio.create(user_id="user_123")
tools = session.tools()
# Pass tools to your agent/LLM framework
\`\`\`

\`\`\`typescript
// ✅ CORRECT — TypeScript (defaults to OpenAI)
import { Composio } from "@composio/core";

const composio = new Composio();
const session = await composio.create("user_123");
const tools = await session.tools();
// Pass tools to your agent/LLM framework
\`\`\`

For other providers, pass the provider explicitly. Provider packages follow the naming convention: \`composio_<provider>\` for Python, \`@composio/<provider>\` for TypeScript.

### MCP

Use \`session.mcp.url\` and \`session.mcp.headers\` with any MCP-compatible client (Claude Desktop, Cursor, OpenAI Agents, etc.). No provider package needed.

---

## 2. Integration Notes

- \`composio.create(user_id)\` is the standard entry point for agent integrations. Sessions handle tool discovery, authentication, and toolkit versioning automatically; \`user_id\` goes to \`composio.create()\` — individual tool calls in session mode don't take one.
- Execute session tool calls through the session, never through a user ID: either \`session.execute(tool_slug, arguments=...)\` / \`session.execute(toolSlug, arguments)\`, which works with every provider, or pass the session to the provider helper — \`provider.handle_tool_calls(response=response, session=session)\` in Python, \`provider.handleToolCalls(session, response)\` in TypeScript. Only the OpenAI and Anthropic helpers accept a session; with other providers, use \`session.execute()\`. Binding the helper to a user ID takes the direct execution path, and session meta-tools fail there with \`"can only be called inside a tool-router session"\`.
- Composio-managed auth is the default: the agent connects accounts at runtime through the session, so users don't need to pre-create auth configs or connected accounts for managed toolkits.
- Provider packages follow the framework, not the model vendor: for the OpenAI Agents SDK the package is \`composio_openai_agents\` / \`@composio/openai-agents\` (importing \`composio_openai\` / \`@composio/openai\` there is the most common mistake in generated code — that package is for the plain OpenAI Chat Completions API).
- **Direct execution** (\`composio.tools.get()\`, \`composio.tools.execute()\`, \`provider.handle_tool_calls()\` with a user ID) is a fully supported lower-level interface: your code picks the tool, no runtime discovery. It fits deterministic workflows and scripts; sessions fit agents that decide at runtime. The tradeoffs are documented at https://docs.composio.dev/docs/sessions-vs-direct-execution. Note that direct execution requires a toolkit version (https://docs.composio.dev/docs/tools-direct/toolkit-versioning).

---

# 3. Calling the REST API directly

${REST_VERSION_GUIDANCE}

${TOOL_VERSION_GUIDANCE}
${TERMINOLOGY_MIGRATION}
`;
