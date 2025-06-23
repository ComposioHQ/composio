/**
 * @example
 *
 * ```typescript
 * // Map of Composio's ABLY toolkit.
 * export const ABLY = {
 *   slug: "ably",
 *   tools: {
 *     BATCH_PRESENCE: "ABLY_BATCH_PRESENCE",
 *     BATCH_PRESENCE_HISTORY: "ABLY_BATCH_PRESENCE_HISTORY",
 *     CREATE_CHANNEL: "ABLY_CREATE_CHANNEL",
 *     DELETE_CHANNEL_SUBSCRIPTION: "ABLY_DELETE_CHANNEL_SUBSCRIPTION",
 *     GET_CHANNEL_DETAILS: "ABLY_GET_CHANNEL_DETAILS",
 *     GET_CHANNEL_HISTORY: "ABLY_GET_CHANNEL_HISTORY",
 *     GET_PRESENCE_HISTORY: "ABLY_GET_PRESENCE_HISTORY",
 *     GET_SERVICE_TIME: "ABLY_GET_SERVICE_TIME",
 *     GET_STATS: "ABLY_GET_STATS",
 *     LIST_PUSH_CHANNEL_SUBSCRIPTIONS: "ABLY_LIST_PUSH_CHANNEL_SUBSCRIPTIONS",
 *     PUBLISH_MESSAGE_TO_CHANNEL: "ABLY_PUBLISH_MESSAGE_TO_CHANNEL",
 *   },
 *   triggerTypes: {},
 * }
 * ```
 */

import * as ts from '@composio/ts-builders';
import { pipe, Record } from 'effect';
import type { ToolkitName } from 'src/models/toolkits';
import type { ToolkitIndex, ToolkitIndexData } from 'src/generation/create-toolkit-index';
import type { SourceFile } from 'src/generation/types';

/**
 * Generates a list of TypeScript source files that should be written to disk by the caller.
 */
export function generateTypeScriptToolkitSources(banner: string) {
  return (index: ToolkitIndex): Array<SourceFile> => {
    const toolkitSources = pipe(
      index,
      Record.mapEntries(generateTypeScriptToolkitSource(banner)),
      Record.toEntries
    );

    return toolkitSources;
  };
}

function generateTypeScriptToolkitSource(_banner: string) {
  return (
    { slug, tools, triggerTypes }: ToolkitIndexData,
    toolkitName: ToolkitName
  ): SourceFile => {
    const filename = `${slug}.ts`;

    const file = ts.file();

    const entry = ts.propertyValue(
      toolkitName,
      ts
        .objectValue()
        .add(ts.propertyValue('slug', ts.stringLiteral(slug).asValue()))
        .add(
          ts.propertyValue(
            'tools',
            ts
              .objectValue()
              .addMultiple(
                Object.entries(tools).map(([toolName, tool]) =>
                  ts.propertyValue(toolName, ts.stringLiteral(tool).asValue())
                )
              )
          )
        )
        .add(
          ts.propertyValue(
            'triggerTypes',
            ts
              .objectValue()
              .addMultiple(
                Object.entries(triggerTypes).map(([triggerTypeSlug, triggerType]) =>
                  ts.propertyValue(triggerTypeSlug, ts.stringLiteral(triggerType).asValue())
                )
              )
          )
        )
    );

    file.add(
      ts
        .moduleExport(ts.constDeclaration(entry.name as string).setValue(entry.value))
        .setDocComment(ts.docComment(`Map of Composio's ${entry.name} toolkit.`))
    );

    const filesource = ts.stringify(file);

    return [filename, filesource];
  };
}
