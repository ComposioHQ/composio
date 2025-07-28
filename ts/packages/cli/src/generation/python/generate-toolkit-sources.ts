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
 *         NEW_GMAIL_MESSAGE = {
 *           config: {
 *             # ...
 *           },
 *           description: "Triggers when a new message is received in Gmail.",
 *           instructions:
 *             "\n    **Instructions for Setting Up the Trigger:**\n\n    - Ensure that the Gmail API is enabled for your Google account.\n    - Provide the user ID (usually 'me' for the authenticated user).\n    - Optionally, provide label IDs to filter messages.\n    ",
 *           name: "New Gmail Message Received Trigger",
 *           payload: {
 *             # ...
 *           },
 *           slug: 'GMAIL_NEW_GMAIL_MESSAGE',
 *           type: 'poll',
 *         }
 * ```
 */

import { pipe, Record } from 'effect';
import type { ToolkitName } from 'src/models/toolkits';
import type { ToolkitIndex, ToolkitIndexData } from 'src/generation/create-toolkit-index';
import type { SourceFile } from 'src/generation/types';
import type { TriggerType } from 'src/models/trigger-types';

/**
 * Converts a JavaScript value to Python dictionary/literal syntax
 */
function jsToPython(value: unknown, indent = 0): string {
  const spacePad = ' '.repeat(indent);

  if (value === null) {
    return 'None';
  }

  if (value === undefined) {
    return 'None';
  }

  if (typeof value === 'string') {
    // Escape quotes and return as Python string
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const items = value.map(item => jsToPython(item, indent + 2));
    return `[${items.join(', ')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return '{}';
    }

    const formattedEntries = entries.map(([key, val]) => {
      const formattedKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : JSON.stringify(key);
      const formattedValue = jsToPython(val, indent + 2);
      return `${spacePad}  ${formattedKey}: ${formattedValue}`;
    });

    return `{\n${formattedEntries.join(',\n')}\n${spacePad}}`;
  }

  // Fallback for unknown types
  return JSON.stringify(value);
}

/**
 * Generates Python dictionary syntax for a trigger type object
 */
function generateTriggerTypePythonDict(triggerType: TriggerType, indent = 0): string {
  return jsToPython(triggerType, indent);
}

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
          .map(([triggerName, triggerValue]) => {
            const pythonDict = generateTriggerTypePythonDict(triggerValue, spacing);
            return `${spacePad}${triggerName} = ${pythonDict}`;
          })
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
