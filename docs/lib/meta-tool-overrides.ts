/**
 * Hand-written copy overrides for meta tool reference pages.
 *
 * The meta tool JSON (`public/data/meta-tools.json`) and the generated MDX are
 * regenerated from the Tool Router API by `scripts/generate-meta-tools.ts`, so
 * editing those gets clobbered. This map survives regeneration: it is merged
 * over the API data at read time in `lib/meta-tools-data.ts`.
 *
 * Each entry provides Modal-voice display copy. The API still owns the input
 * and response schemas; we only override the prose.
 */

export interface MetaToolOverride {
  /** One confident sentence on what the tool does. Replaces the API description for display. */
  summary: string;
  /** When you should reach for this tool in a session. */
  whenToUse: string;
  /** Optional short note on usage, ordering, or gotchas. */
  usageNote?: string;
}

export const META_TOOL_OVERRIDES: Record<string, MetaToolOverride> = {
  COMPOSIO_SEARCH_TOOLS: {
    summary:
      'Discovers the right tools across 500+ apps for a task and returns them with an execution plan, connection status, and the `session_id` that ties the rest of the workflow together.',
    whenToUse:
      'Call `COMPOSIO_SEARCH_TOOLS` first, at the start of any task that touches an external app or service. Run it again whenever the user pivots to a new use case so you get a fresh `session_id` and a plan scoped to the new work.',
    usageNote:
      'Split a request into atomic queries (one query per tool call) and name the app in each query so intent stays scoped. The response tells you which toolkits already have an active connection and which need `COMPOSIO_MANAGE_CONNECTIONS`.',
  },
  COMPOSIO_GET_TOOL_SCHEMAS: {
    summary:
      'Returns the full input schema for tools you already know the slug for, so you can build schema-compliant arguments before executing.',
    whenToUse:
      'Reach for `COMPOSIO_GET_TOOL_SCHEMAS` when `COMPOSIO_SEARCH_TOOLS` hands you a tool with a `schemaRef` instead of an inline `input_schema`, or when you need the `output_schema` to validate a response in the workbench.',
    usageNote:
      'Only pass slugs that `COMPOSIO_SEARCH_TOOLS` returned. Never guess or fabricate a slug. If a slug is not found, the response suggests close matches you can call again with.',
  },
  COMPOSIO_MANAGE_CONNECTIONS: {
    summary:
      'Checks connection status for a toolkit and returns a branded authentication link when the user needs to connect, covering OAuth, API keys, and every other auth type.',
    whenToUse:
      'Call `COMPOSIO_MANAGE_CONNECTIONS` when `COMPOSIO_SEARCH_TOOLS` reports that a toolkit has no active connection. You must have an active connection before you execute any tool from that toolkit.',
    usageNote:
      'When the tool returns a `redirect_url`, show it to the user as a formatted markdown link and wait for the connection to go active before executing. Set `reinitiate_all` to force a fresh connection when credentials are stale.',
  },
  COMPOSIO_MULTI_EXECUTE_TOOL: {
    summary:
      'Executes up to 50 tools in parallel and returns structured outputs ready for immediate analysis.',
    whenToUse:
      'Use `COMPOSIO_MULTI_EXECUTE_TOOL` to run tools that `COMPOSIO_SEARCH_TOOLS` discovered. Batch tools into one call only when they are logically independent, with no ordering or output-to-input dependencies between them.',
    usageNote:
      'Pass strictly schema-compliant arguments and make sure each toolkit has an active connection first. Set `sync_response_to_workbench` to true when a response may be large or needed for later scripting; otherwise process small responses inline.',
  },
  COMPOSIO_REMOTE_WORKBENCH: {
    summary:
      'Runs Python in a persistent remote sandbox to process large remote files and script bulk or repeated tool executions.',
    whenToUse:
      'Reach for `COMPOSIO_REMOTE_WORKBENCH` when data lives in a remote file rather than inline in the chat, when you need to run a known tool in bulk (for example, label 100 emails), or when you want to call an API via `proxy_execute` because no Composio tool exists for it.',
    usageNote:
      'State persists across calls like a Jupyter notebook, and helper functions such as `run_composio_tool` and `invoke_llm` are preloaded. There is a hard 3-minute execution limit per cell, so split work into steps and checkpoint intermediate results to `/mnt/files/`. Do not use it for data you can already see inline.',
  },
  COMPOSIO_REMOTE_BASH_TOOL: {
    summary:
      'Runs bash commands in a remote sandbox for file operations, data processing, and system tasks.',
    whenToUse:
      'Use `COMPOSIO_REMOTE_BASH_TOOL` to work with large tool responses that `COMPOSIO_MULTI_EXECUTE_TOOL` saved to remote files, or to run quick file and shell operations with tools like `jq`, `awk`, `sed`, and `grep`.',
    usageNote:
      'Commands run from `/home/user` by default and share the same 3-minute execution limit, so break large tasks into smaller commands.',
  },
};

export function getMetaToolOverride(slug: string): MetaToolOverride | undefined {
  return META_TOOL_OVERRIDES[slug];
}
