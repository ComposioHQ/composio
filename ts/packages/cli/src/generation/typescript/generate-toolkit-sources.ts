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
import type { TriggerType } from 'src/models/trigger-types';

function jsValueToTsValue(value: unknown): ts.ValueBuilder {
  if (value === null) {
    return ts.namedValue('null');
  }

  if (value === undefined) {
    return ts.namedValue('undefined');
  }

  if (typeof value === 'string') {
    return ts.stringLiteral(value).asValue();
  }

  if (typeof value === 'number') {
    return ts.namedValue(value.toString());
  }

  if (typeof value === 'boolean') {
    return ts.namedValue(value.toString());
  }

  if (Array.isArray(value)) {
    const array = new ts.ArrayValue();
    for (const item of value) {
      array.add(jsValueToTsValue(item));
    }
    return array;
  }

  if (typeof value === 'object' && value !== null) {
    const objectValue = ts.objectValue();
    for (const [key, val] of Object.entries(value)) {
      objectValue.add(ts.propertyValue(key, jsValueToTsValue(val)));
    }
    return objectValue;
  }

  // Fallback for unknown types
  return ts.stringLiteral(JSON.stringify(value)).asValue();
}

/**
 * Generates a TypeScript object literal for a trigger type
 */
function generateTriggerTypeObjectValue(triggerType: TriggerType): ts.ValueBuilder {
  return ts
    .objectValue()
    .add(ts.propertyValue('slug', ts.stringLiteral(triggerType.slug).asValue()))
    .add(ts.propertyValue('name', ts.stringLiteral(triggerType.name).asValue()))
    .add(ts.propertyValue('description', ts.stringLiteral(triggerType.description).asValue()))
    .add(
      ts.propertyValue(
        'instructions',
        triggerType.instructions
          ? ts.stringLiteral(triggerType.instructions).asValue()
          : ts.namedValue('undefined')
      )
    )
    .add(ts.propertyValue('config', jsValueToTsValue(triggerType.config)))
    .add(ts.propertyValue('payload', jsValueToTsValue(triggerType.payload)))
    .add(ts.propertyValue('type', ts.stringLiteral(triggerType.type).asValue()));
}

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
                  ts.propertyValue(triggerTypeSlug, generateTriggerTypeObjectValue(triggerType))
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
