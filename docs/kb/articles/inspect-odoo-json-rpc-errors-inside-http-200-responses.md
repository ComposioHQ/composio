`ODOO_CALL_ODOO_JSONRPC` can receive HTTP 200 while the JSON-RPC response body contains an `error`, such as `access denied`. The HTTP status confirms that the transport succeeded; it does not mean the Odoo method succeeded. Always inspect the returned JSON-RPC envelope.

Verify the instance URL, database name, API key, and the Odoo user's permission for the requested model and method. Prefer current JSON-2 tools where they cover the use case. If the body still contains an application error, contact Composio support with the log ID and timestamp, but never include the API key.
