import type { Toolkit } from 'src/models/toolkits';
import { bold, gray } from 'src/ui/colors';
import { truncate } from 'src/ui/truncate';

/**
 * Format a list of toolkits as a human-readable table.
 */
export function formatToolkitsTable(toolkits: ReadonlyArray<Toolkit>): string {
  const header = `${bold('Name'.padEnd(20))} ${bold('Slug'.padEnd(20))} ${bold('Tools'.padEnd(7))} ${bold('Triggers'.padEnd(10))} ${bold('Description')}`;

  const rows = toolkits.map(t => {
    const name = t.name.padEnd(20);
    const slug = t.slug.padEnd(20);
    const tools = String(t.meta.tools_count).padEnd(7);
    const triggers = String(t.meta.triggers_count).padEnd(10);
    const desc = gray(truncate(t.meta.description, 50));
    return `${name} ${slug} ${tools} ${triggers} ${desc}`;
  });

  return [header, ...rows].join('\n');
}

/**
 * Format toolkits as JSON for piped output.
 */
export function formatToolkitsJson(toolkits: ReadonlyArray<Toolkit>): string {
  return JSON.stringify(
    toolkits.map(t => ({
      name: t.name,
      slug: t.slug,
      tools_count: t.meta.tools_count,
      triggers_count: t.meta.triggers_count,
      description: t.meta.description,
    })),
    null,
    2
  );
}
