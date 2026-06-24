# Docs Knowledge Base — removed / parked content

A dumping ground for content removed from the published docs during the docs
overhaul. Nothing here is rendered. Keep it so we don't lose nuance we may want
to reintroduce (e.g. in deeper guides, FAQs, or the LLM-facing `.md` output).

Each entry: **what it was**, **where it came from**, **why removed**, **the content**.

---

## 1. "Native Tools vs MCP" decision framing

**Where:** `content/docs/native-tools-vs-mcp.mdx` (whole page) + the native/MCP
tab split in `quickstart.mdx`.

**Why removed:** We decided to stop presenting native-vs-MCP as a decision the
user has to make up front. Default everyone to **native tools**; MCP becomes an
opt-in documented on a single "Using sessions via MCP" page. This removes a fork
in the road from the first-run experience.

**Parked content — the comparison table + token-cost argument:**

> **Native tools** give your LLM tool schemas as function definitions. Composio
> formats them for your specific framework (OpenAI, Anthropic, Vercel AI, etc.)
> through provider packages.
>
> **MCP** exposes tools through the Model Context Protocol. Any MCP-compatible
> client can connect to a Composio MCP server URL. No provider packages needed.
>
> | | Native tools | MCP |
> |---|---|---|
> | **Setup** | Provider package for your framework | SDK or just a URL |
> | **Intercepting tool calls** | Yes, you can log, retry, or require approval before each call | Limited, depends on what the MCP client supports |
> | **Context window** | You control what's loaded | Client loads all tools the server exposes |
> | **Latency** | SDK calls Composio API directly | MCP protocol adds overhead for tool list discovery and each execution |
>
> With native tools, you choose exactly which schemas enter your LLM's context.
> With MCP, the client pulls the full tool list from the server. A
> [5-server setup can consume ~55K tokens](https://www.anthropic.com/engineering/advanced-tool-use)
> before the conversation starts. If you're working with many tools, native
> tools give you more control over that cost.

**Note:** the token-cost framing is slightly inaccurate for Composio sessions
since session.tools() returns *meta tools* (search/execute) rather than the full
tool list — so the "55K tokens" client-loads-everything point applies to naive
MCP, not necessarily to a Composio session over MCP. Worth a cleaner write-up if
reintroduced.
