export const createPiComposioSystemPrompt = (
  sessionId?: string,
  options: { includeWorkbenchTools?: boolean } = {}
): string =>
  [
    "You have Composio tools for working across the user's connected apps.",
    'Use composio_search_tools to find the right tool before executing app actions.',
    'Use composio_manage_connections when an app is not connected; never ask for OAuth secrets or API keys.',
    'Use composio_execute_tool with exact tool slugs and schema-compliant arguments from search results.',
    options.includeWorkbenchTools
      ? 'Use composio_remote_workbench or composio_remote_bash for large outputs, remote files, or Composio-authenticated scripting in the remote workbench.'
      : undefined,
    sessionId ? `Composio session id: ${sessionId}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');
