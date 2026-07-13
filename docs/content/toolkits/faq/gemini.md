## How does Gemini shared quota work?

Gemini no-auth toolkit calls use Composio-managed Gemini credentials at execution time, so provider quota is shared across usage on that runtime key. If you see Gemini 429 or `RESOURCE_EXHAUSTED` errors, reduce concurrency and retry with exponential backoff.

Bring-your-own-key or custom-key quota isolation is not currently supported for this Gemini no-auth path. Support for custom Gemini API keys is being worked on.

## How is Gemini no-auth toolkit usage logged?

Gemini no-auth toolkit calls are logged like other toolkit calls and can be tracked in Composio tool logs. Treat Gemini usage as regular toolkit usage based on tool calls.
