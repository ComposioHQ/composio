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
import { Record } from 'effect';
import { jsonSchemaToTsBuilders } from '@composio/json-schema-to-ts-builders';
import type { ToolkitName } from 'src/models/toolkits';
import type { ToolkitIndex, ToolkitIndexData } from 'src/generation/create-toolkit-index';
import type { SourceFile } from 'src/generation/types';

/**
 * Generates a list of TypeScript source files that should be written to disk by the caller.
 */
export function generateTypeScriptToolkitSources(
  banner: string,
  triggerPayloadTypes: Map<string, Record<string, unknown>>
) {
  return async (index: ToolkitIndex): Promise<Array<SourceFile>> => {
    const toolkitEntries = Record.toEntries(index);
    const toolkitSources: Array<SourceFile> = [];

    for (const [toolkitName, toolkitData] of toolkitEntries) {
      const sourceFile = await generateTypeScriptToolkitSource(banner, triggerPayloadTypes)(
        toolkitData,
        toolkitName as ToolkitName
      );
      toolkitSources.push(sourceFile);
    }

    return toolkitSources;
  };
}

function generateTypeScriptToolkitSource(
  _banner: string,
  triggerPayloadTypes: Map<string, Record<string, unknown>>
) {
  return async (
    { slug, tools, triggerTypes }: ToolkitIndexData,
    toolkitName: ToolkitName
  ): Promise<SourceFile> => {
    const filename = `${slug}.ts`;

    const file = ts.file();

    // Add import for TriggerEvent type
    if (Object.keys(triggerTypes).length > 0) {
      file.addImport(ts.moduleImport('@composio/core').named('TriggerEvent'));
    }

    // Generate trigger payload types with deduplication using ts-builders
    const allTypeDeclarations: ts.TypeDeclaration[] = [];
    const triggerTypeMapping: Record<string, string> = {};

    for (const [triggerTypeSlug, triggerType] of Object.entries(triggerTypes)) {
      const payloadSchema = triggerPayloadTypes.get(triggerType);
      if (payloadSchema) {
        const typeName = `${toolkitName}_${triggerTypeSlug}_PAYLOAD`;
        try {
          const result = jsonSchemaToTsBuilders(payloadSchema, typeName, {
            withoutDescriptions: false,
          });

          // Collect all generated type declarations with deduplication
          const existingTypeNames = new Set(allTypeDeclarations.map(decl => decl.name));

          // Always add the main payload type declaration
          allTypeDeclarations.push(result.mainDeclaration);

          // Add helper type declarations only if they don't already exist
          for (const declaration of result.declarations) {
            if (!existingTypeNames.has(declaration.name)) {
              // Convert plain objects to proper TypeDeclaration instances
              const typeDecl =
                'setName' in declaration
                  ? declaration
                  : ts.typeDeclaration(declaration.name, declaration.type);
              allTypeDeclarations.push(typeDecl);
              existingTypeNames.add(declaration.name);
            }
          }

          triggerTypeMapping[triggerTypeSlug] = typeName;
        } catch (error) {
          triggerTypeMapping[triggerTypeSlug] = 'unknown';
        }
      } else {
        // Fallback to unknown if payload type is not available
        triggerTypeMapping[triggerTypeSlug] = 'unknown';
      }
    }

    // Add all type declarations to the file
    for (const typeDeclaration of allTypeDeclarations) {
      file.add(typeDeclaration);
    }

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

    // Add the type mapping for trigger payload types using ts-builders
    if (Object.keys(triggerTypeMapping).length > 0) {
      const payloadMappingProperties = Object.entries(triggerTypeMapping).map(
        ([triggerSlug, typeName]) => {
          const propType = typeName === 'unknown' ? ts.unknownType : ts.namedType(typeName);
          return ts.property(triggerSlug, propType);
        }
      );

      const payloadMappingType = ts.typeDeclaration(
        `${toolkitName}_TRIGGER_PAYLOADS`,
        ts.objectType().addMultiple(payloadMappingProperties)
      );

      // Add the exported trigger payloads type to the file
      file.add(ts.moduleExport(payloadMappingType));

      // Generate specific trigger event types for each trigger
      const triggerEventProperties = Object.entries(triggerTypeMapping).map(
        ([triggerSlug, typeName]) => {
          const eventType =
            typeName === 'unknown'
              ? ts.namedType('TriggerEvent')
              : ts.namedType('TriggerEvent').addGenericArgument(ts.namedType(typeName));
          return ts.property(triggerSlug, eventType);
        }
      );

      const triggerEventsType = ts.typeDeclaration(
        `${toolkitName}_TRIGGER_EVENTS`,
        ts.objectType().addMultiple(triggerEventProperties)
      );

      // Add the exported trigger events type to the file
      file.add(ts.moduleExport(triggerEventsType));
    }

    const filesource = ts.stringify(file);

    return [filename, filesource];
  };
}
