import type { ToolRetrieveResponse } from '@composio/client/resources/tools';
import { commandHintExample } from 'src/services/command-hints';
import { bold } from 'src/ui/colors';

/** The cached input definition `tools info` reports: where it lives and which version it is. */
export type ToolInfoDefinition = {
  readonly schemaPath: string;
  readonly version: string | null;
};

// --- stderr -----------------------------------------------------------------------------------

export const MISSING_SLUG_MESSAGE = 'Missing required argument: <slug>';
export const MISSING_SLUG_HINT =
  'Try specifying a tool slug, e.g.:\n> composio tools info "GMAIL_SEND_EMAIL"';

export const fetchingToolMessage = (slug: string) => `Fetching tool "${slug}"...`;
export const toolNotFoundMessage = (slug: string) => `Tool "${slug}" not found.`;

/** One "did you mean" suggestion for a slug that was not found. */
export const toolSuggestion = (tool: { readonly slug: string; readonly description: string }) => ({
  label: `${tool.slug} — ${tool.description}`,
  command: `> composio tools info "${tool.slug}"`,
});

/** The note body: slug, name, toolkit, version, description, and the schema cache path. */
export const formatToolInfoSummary = (tool: ToolRetrieveResponse, definition: ToolInfoDefinition) =>
  [
    `${bold('Slug:')} ${tool.slug}`,
    `${bold('Name:')} ${tool.name}`,
    `${bold('Toolkit:')} ${tool.toolkit.slug}`,
    `${bold('Version:')} ${definition.version ?? '-'}`,
    `${bold('Description:')} ${tool.description}`,
    `${bold('Schema Cache:')} ${definition.schemaPath}`,
  ].join('\n');

export const toolInfoNoteTitle = (tool: ToolRetrieveResponse) => `Tool: ${tool.name}`;

export const inspectSchemaHint = (definition: ToolInfoDefinition) =>
  `Inspect schema with jq:\n> jq '{required: (.inputSchema.required // []), keys: (.inputSchema.properties | keys)}' "${definition.schemaPath}"`;

export const executeToolHint = (tool: ToolRetrieveResponse) =>
  `Then execute it:\n> ${commandHintExample('root.execute', { slug: tool.slug })} --dry-run`;

// --- stdout -----------------------------------------------------------------------------------

/** The tool and the CLI-facing input schema `composio execute` validates against. */
export const formatToolInfoJson = (
  tool: ToolRetrieveResponse,
  definition: ToolInfoDefinition,
  inputSchema: unknown
) =>
  JSON.stringify(
    {
      slug: tool.slug,
      name: tool.name,
      description: tool.description,
      toolkit: tool.toolkit.slug,
      version: definition.version,
      schemaPath: definition.schemaPath,
      inputSchema,
    },
    null,
    2
  );
