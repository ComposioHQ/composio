The Granola MCP toolkit uses Granola's official MCP server. The tool names, descriptions, input definitions, and response metadata available through Composio are limited to what that upstream server exposes.

- When Granola supplies only a tool name and description, that is the metadata Composio can expose.
- When Granola does not declare a response or output schema, Composio cannot invent one. An empty output schema alone is not evidence that the Composio catalog is stale.
- To investigate a mismatch, compare the exact tool and missing field with the current official Granola MCP server behavior.
- Contact Composio support when the official server exposes a tool or schema field that is absent from the Composio toolkit.
