Each QuickBooks company needs its own connected account. Create them with distinct `user_id` values so that a session resolves to exactly one company rather than picking whichever connection it finds first.

## Target a specific company from an MCP client

Append the `connected_account_id` or `user_id` for the company you want to the MCP URL or client configuration. The session then targets that QuickBooks connection for every tool call it makes.

Without an explicit target, a session with several eligible QuickBooks connections resolves to one of them on its own, which is why reads sometimes return the wrong company's data even though every connection is healthy.
