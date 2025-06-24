/**
 * @example
 *
 * ```python
 * class ABLY:
 *     """Map of Composio's ABLY toolkit."""
 *
 *     slug: str = "ably"
 *
 *     class tools:
 *         BATCH_PRESENCE = "ABLY_BATCH_PRESENCE"
 *         BATCH_PRESENCE_HISTORY = "ABLY_BATCH_PRESENCE_HISTORY"
 *         CREATE_CHANNEL = "ABLY_CREATE_CHANNEL"
 *         DELETE_CHANNEL_SUBSCRIPTION = "ABLY_DELETE_CHANNEL_SUBSCRIPTION"
 *
 *     class triggers:
 *         pass
 * ```
 */

import { pipe, Record } from 'effect';
import type { ToolkitName } from 'src/models/toolkits';
import type { ToolkitIndex, ToolkitIndexData } from 'src/generation/create-toolkit-index';
import type { SourceFile } from 'src/generation/types';

/**
 * Generates a list of Python source files that should be written to disk by the caller.
 */
export function generatePythonToolkitSources(banner: string) {
  return (index: ToolkitIndex): Array<SourceFile> => {
    const toolkitSources = pipe(
      index,
      Record.mapEntries(generatePythonToolkitSource(banner)),
      Record.toEntries
    );

    return toolkitSources;
  };
}

function generatePythonToolkitSource(banner: string) {
  return (toolkit: ToolkitIndexData, toolkitName: ToolkitName): SourceFile => {
    const filename = `${toolkit.slug}.py`;

    const toolsEntries = (spacing: number) => {
      const spacePad = ' '.repeat(spacing);

      if (Record.size(toolkit.tools) > 0) {
        return Object.entries(toolkit.tools)
          .map(([toolName, toolValue]) => `${spacePad}${toolName} = "${toolValue}"`)
          .join('\n');
      }

      return `${spacePad}pass`;
    };

    const triggerTypesEntries = (spacing: number) => {
      const spacePad = ' '.repeat(spacing);

      if (Record.size(toolkit.triggerTypes) > 0) {
        return Object.entries(toolkit.triggerTypes)
          .map(([triggerName, triggerValue]) => `${spacePad}${triggerName} = "${triggerValue}"`)
          .join('\n');
      }

      return `${spacePad}pass`;
    };

    const filesource = `# ${banner}.

class ${toolkitName}:
    """Map of Composio's ${toolkitName} toolkit."""

    slug: str = "${toolkit.slug}"

    class tools:
${toolsEntries(8)}

    class triggers:
${triggerTypesEntries(8)}
`;

    return [filename, filesource];
  };
}
