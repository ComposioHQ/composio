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
import { Effect, pipe, Record, Array as Arr } from 'effect';
import type { ToolkitName } from 'src/models/toolkits';
import type { ToolkitIndex, ToolkitIndexData } from 'src/generation/create-toolkit-index';
import type { SourceFile } from 'src/generation/types';
import type { TriggerType } from 'src/models/trigger-types';
import {
  generateTypeFromJsonSchema,
  GenerateTypeFromJsonSchemaError,
} from './generate-type-from-json-schema';

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
  return (index: ToolkitIndex) =>
    Effect.gen(function* () {
      const toolkitSources = yield* Effect.all(
        Record.toEntries(index).map(([key, value]) =>
          generateTypeScriptToolkitSource(banner)(key, value)
        )
      );

      return toolkitSources;
    });
}

function generateTypeScriptToolkitSource(_banner: string) {
  return (
    toolkitName: ToolkitName,
    { slug, typeableTools, triggerTypes }: ToolkitIndexData
  ): Effect.Effect<SourceFile, GenerateTypeFromJsonSchemaError, never> => {
    return Effect.gen(function* () {
      const filename = `${slug}.ts`;
      const file = ts.file();

      // add `import { type TriggerEvent } from "@composio/core"`, if there are trigger types
      if (Object.keys(triggerTypes).length > 0) {
        file.addImport(
          ts.moduleImport('@composio/core').named(ts.namedImport('TriggerEvent').typeOnly())
        );
      }

      if (typeableTools.withTypes) {
        file.add(
          ts.docSectionComment(
            `// --------------- //
             //    Tool types   //
             // --------------- //
            `
          )
        );

        // write type declarations for each tool, without exporting them
        for (const [toolName, tool] of Record.toEntries(typeableTools.value)) {
          // e.g., `type GMAIL_SEND_EMAIL_INPUT = { .. }`
          const toolInputType = yield* generateTypeFromJsonSchema(
            `${toolkitName}_${toolName}_INPUT`,
            tool.input_parameters
          );

          // e.g., `type GMAIL_SEND_EMAIL_OUTPUT = { .. }`
          const toolOutputType = yield* generateTypeFromJsonSchema(
            `${toolkitName}_${toolName}_OUTPUT`,
            tool.output_parameters
          );

          file.add(
            ts
              .typeDeclaration(tool.slug, toolInputType)
              .setDocComment(ts.docComment(`Type of ${toolkitName}'s ${tool.slug} tool input.`))
          );

          file.add(
            ts
              .typeDeclaration(tool.slug, toolOutputType)
              .setDocComment(ts.docComment(`Type of ${toolkitName}'s ${tool.slug} tool output.`))
          );
        }

        // write the map of input tool types
        {
          const toolInputTypeEntries = pipe(
            typeableTools.value,
            Record.map((_, toolName) =>
              ts.property(toolName, ts.namedType(`${toolkitName}_${toolName}_INPUT`))
            ),
            Record.toEntries,
            Arr.map(([_, value]) => value)
          );

          const doc = ts.docComment(
            `Type map of all available tool input types for toolkit "${toolkitName}".`
          );

          file.add(
            ts
              .moduleExport(
                ts.typeDeclaration(
                  `${toolkitName}_TOOL_INPUTS`,
                  ts.objectType().addMultiple(toolInputTypeEntries)
                )
              )
              .setDocComment(doc)
          );
        }

        // write the map of output tool types
        {
          const toolOutputTypeEntries = pipe(
            typeableTools.value,
            Record.map((_, toolName) =>
              ts.property(toolName, ts.namedType(`${toolkitName}_${toolName}_OUTPUT`))
            ),
            Record.toEntries,
            Arr.map(([_, value]) => value)
          );

          const doc = ts.docComment(
            `Type map of all available tool input types for toolkit "${toolkitName}".`
          );

          file.add(
            ts
              .moduleExport(
                ts.typeDeclaration(
                  `${toolkitName}_TOOL_OUTPUTS`,
                  ts.objectType().addMultiple(toolOutputTypeEntries)
                )
              )
              .setDocComment(doc)
          );
        }
      }

      file.add(
        ts.docSectionComment(
          `// ------------------- //
           //    Trigger types    //
           // ------------------- //
          `
        )
      );

      // write type declarations for each trigger payload, without exporting them
      for (const [triggerTypeSlug, triggerType] of Record.toEntries(triggerTypes)) {
        // e.g., `type GMAIL_NEW_GMAIL_MESSAGE_PAYLOAD = { .. }`
        const triggerPayloadType = yield* generateTypeFromJsonSchema(
          `${toolkitName}_${triggerTypeSlug}_PAYLOAD`,
          triggerType.payload
        );
        file.add(
          ts
            .typeDeclaration(triggerTypeSlug, triggerPayloadType)
            .setDocComment(
              ts.docComment(`Type of ${toolkitName}'s ${triggerTypeSlug} trigger payload.`)
            )
        );
      }

      // write the toolkit const object declaration
      const toolValueDeclaration = ts.propertyValue(
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
                  Object.entries(typeableTools.value).map(([toolName, tool]) =>
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
          .moduleExport(
            ts
              .constDeclaration(toolValueDeclaration.name as string)
              .setValue(toolValueDeclaration.value)
          )
          .setDocComment(ts.docComment(`Map of Composio's ${toolValueDeclaration.name} toolkit.`))
      );

      // write the map of trigger payload types
      {
        const triggerPayloadTypeEntries = pipe(
          triggerTypes,
          Record.map((_, triggerTypeSlug) =>
            ts.property(triggerTypeSlug, ts.namedType(`${toolkitName}_${triggerTypeSlug}_PAYLOAD`))
          ),
          Record.toEntries,
          Arr.map(([_, value]) => value)
        );

        const doc = ts.docComment(
          `Type map of all available trigger payloads for toolkit "${toolkitName}".`
        );

        file.add(
          ts
            .moduleExport(
              ts.typeDeclaration(
                `${toolkitName}_TRIGGER_PAYLOADS`,
                ts.objectType().addMultiple(triggerPayloadTypeEntries)
              )
            )
            .setDocComment(doc)
        );
      }

      // write the map of trigger events
      {
        const triggerEventTypeEntries = pipe(
          triggerTypes,
          Record.map((_, triggerTypeSlug) =>
            ts.property(
              triggerTypeSlug,
              ts
                .namedType('TriggerEvent')
                .addGenericArgument(ts.namedType(`${toolkitName}_${triggerTypeSlug}_PAYLOAD`))
            )
          ),
          Record.toEntries,
          Arr.map(([_, value]) => value)
        );

        const doc = ts.docComment(
          `Type map of all available trigger events for toolkit "${toolkitName}".`
        );

        file.add(
          ts
            .moduleExport(
              ts.typeDeclaration(
                `${toolkitName}_TRIGGER_EVENTS`,
                ts.objectType().addMultiple(triggerEventTypeEntries)
              )
            )
            .setDocComment(doc)
        );
      }

      const filesource = ts.stringify(file);

      return [filename, filesource];
    });
  };
}
