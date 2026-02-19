import type { Tool } from 'src/models/tools';
import type { ToolDetailedResponse } from 'src/services/composio-clients';
import { bold, gray } from 'src/ui/colors';
import { truncate } from 'src/ui/truncate';

/**
 * Format a list of tools as a human-readable table.
 */
export function formatToolsTable(tools: ReadonlyArray<Tool>): string {
  const header = `${bold('Slug'.padEnd(35))} ${bold('Name'.padEnd(20))} ${bold('Description')}`;

  const rows = tools.map(t => {
    const slug = truncate(t.slug, 35).padEnd(35);
    const name = truncate(t.name, 20).padEnd(20);
    const desc = gray(truncate(t.description, 50));
    return `${slug} ${name} ${desc}`;
  });

  return [header, ...rows].join('\n');
}

/**
 * Format tools as JSON for piped output.
 */
export function formatToolsJson(tools: ReadonlyArray<Tool>): string {
  return JSON.stringify(
    tools.map(t => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      tags: t.tags,
    })),
    null,
    2
  );
}

/**
 * Format JSON Schema properties as a human-readable parameter table.
 * Extracts `properties` entries, cross-references `required` array.
 */
function formatSchemaProperties(schema: Record<string, unknown>): string {
  const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
  if (!properties || Object.keys(properties).length === 0) {
    return '  (none)';
  }

  const requiredArr = (schema['required'] as string[] | undefined) ?? [];
  const requiredSet = new Set(requiredArr);

  const entries = Object.entries(properties).map(([name, prop]) => {
    const type = (prop['type'] as string) ?? 'unknown';
    const label = requiredSet.has(name) ? 'required' : 'optional';
    const description = prop['description'] as string | undefined;
    return { name, type, label, description };
  });

  const nameWidth = Math.max(...entries.map(e => e.name.length));
  const typeWidth = Math.max(...entries.map(e => e.type.length));
  const labelWidth = Math.max(...entries.map(e => e.label.length));

  return entries
    .map(e => {
      const desc = e.description ? `  ${gray(`"${truncate(e.description, 50)}"`)}` : '';
      return `  ${e.name.padEnd(nameWidth)} ${e.type.padEnd(typeWidth)} ${e.label.padEnd(labelWidth)}${desc}`;
    })
    .join('\n');
}

/**
 * Format a detailed tool for interactive display.
 */
export function formatToolInfo(tool: ToolDetailedResponse): string {
  const lines: string[] = [];

  lines.push(`${bold('Name:')} ${tool.name}`);
  lines.push(`${bold('Slug:')} ${tool.slug}`);
  lines.push(`${bold('Description:')} ${tool.description}`);
  lines.push(`${bold('Tags:')} ${tool.tags.length > 0 ? tool.tags.join(', ') : '(none)'}`);

  if (tool.toolkit.slug) {
    lines.push(`${bold('Toolkit:')} ${tool.toolkit.name} (${tool.toolkit.slug})`);
  }

  if (tool.no_auth) {
    lines.push(`${bold('Auth:')} No authentication required`);
  }

  if (tool.available_versions.length > 0) {
    lines.push(`${bold('Versions:')} ${tool.available_versions.join(', ')}`);
  }

  // Input parameters
  lines.push('');
  lines.push(bold('Input Parameters:'));
  lines.push(formatSchemaProperties(tool.input_parameters as Record<string, unknown>));

  // Output parameters
  lines.push('');
  lines.push(bold('Output Parameters:'));
  lines.push(formatSchemaProperties(tool.output_parameters as Record<string, unknown>));

  return lines.join('\n');
}
