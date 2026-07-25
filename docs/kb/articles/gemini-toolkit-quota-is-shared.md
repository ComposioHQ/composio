Gemini toolkit quota can be backed by shared Composio credentials. When it is, you share a provider quota pool with other users, so you can hit a limit while your own usage is low. The ceiling is the provider's, not your Composio plan's.

If custom API-key authentication is available for the active toolkit version, supplying your own Gemini key gives you independent quota. If it is not available on your version, contact support to confirm the current quota-isolation path.

## Usage still counts as tool calls

Gemini no-auth toolkit calls are logged like any other toolkit call and appear in Composio tool logs. They count toward tool-call accounting on your plan even though the toolkit itself requires no connection.
