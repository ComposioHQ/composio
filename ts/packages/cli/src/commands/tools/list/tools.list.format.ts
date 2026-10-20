import type { Tool } from 'src/models/tools';
import { commandHintStep } from 'src/services/command-hints';
import { isRemoteCustomToolkitSlug } from 'src/utils/remote-custom-toolkit';
import { formatToolsTable } from '../format';

// --- stderr -----------------------------------------------------------------------------------

export const FETCHING_TOOLS_MESSAGE = 'Fetching tools...';

/**
 * The warning for a toolkit with no tools. A custom toolkit's tools are served by the Tool
 * Router, so it points at `composio search` instead of the toolkit list.
 */
export const noToolsFoundMessage = (toolkit: string) =>
  isRemoteCustomToolkitSlug(toolkit)
    ? `No tools found in toolkit "${toolkit}". Custom toolkit tools are served by the Tool Router. ${commandHintStep('Discover them with', 'root.search', { toolkits: toolkit })}`
    : `No tools found in toolkit "${toolkit}". Verify the toolkit slug with:\n> composio dev toolkits list`;

/** The count, the page position when there is more than one page, and the table. */
export const formatToolsListing = (tools: ReadonlyArray<Tool>, totalPages: number) =>
  totalPages > 1
    ? `Listing ${tools.length} tools (page 1 of ${totalPages})\n\n${formatToolsTable(tools)}`
    : `Listing ${tools.length} tools\n\n${formatToolsTable(tools)}`;

export const inspectToolHint = (slug: string) =>
  `To inspect a tool:\n> composio tools info "${slug}"`;
