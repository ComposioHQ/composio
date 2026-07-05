## How does Gemini shared quota work?

Gemini no-auth toolkit calls use Composio-managed Gemini credentials at execution time, so provider quota is shared across usage on that runtime key. If you see Gemini 429 or `RESOURCE_EXHAUSTED` errors, reduce concurrency, retry with exponential backoff, and use a BYOK/custom-key auth path if one is available for your setup and you need isolated quota.

## How is Gemini no-auth toolkit usage logged?

Gemini no-auth toolkit calls are logged like other toolkit calls and can be tracked in Composio tool logs. Treat Gemini usage as regular toolkit usage based on tool calls.

## Gemini can use Composio Tool Router through any MCP client

Tool Router can be used with any MCP client or framework/LLM that supports tool calling or MCP. For Gemini, initialize Composio with `GeminiProvider`, create a session, then connect to the session MCP URL and headers using a streamable HTTP MCP client.

## Gemini CLI MCP issues may be client-side; Claude can be a more stable fallback

If a Composio MCP server URL returns tools but Gemini CLI still fails, the behavior may be in the Gemini client. Try the latest Gemini CLI version, or use another MCP client as a fallback.
