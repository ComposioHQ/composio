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
import { pipe, Record, Array as Arr } from 'effect';
import type { ToolkitIndex } from 'src/generation/create-toolkit-index';

const BARREL_OBJECT_NAME = 'Toolkits';

export type GenerateTypeScriptIndexMapSourceParams = {
  banner: string;
  emitSingleFile: boolean;
  importExtension: 'ts' | 'mjs';
};

export function generateIndexSource(params: GenerateTypeScriptIndexMapSourceParams) {
  return (index: ToolkitIndex) => {
    const indexMap = generateTypeScriptIndexMapSource(params)(index);
    const toolkitUnionType = generateToolkitUnionType(index);
    const toolsByToolkitType = generateToolsByToolkitType();

    const indexMapWithBanner = params.emitSingleFile
      ? indexMap
      : `${ts.stringify(ts.docComment(params.banner))}
${indexMap}`;

    // Add the Toolkit type to the generated code
    const code = `${indexMapWithBanner}
${ts.stringify(ts.docComment('Type declarations'))}
${toolkitUnionType}
${toolsByToolkitType}
`;

    return code;
  };
}

/**
 * Generates a list of Python source files that should be written to disk by the caller.
 */
export function generateTypeScriptIndexMapSource(params: GenerateTypeScriptIndexMapSourceParams) {
  return (index: ToolkitIndex): string => {
    const indexMapEntries = pipe(
      index,
      Record.map((_, key) => ts.propertyValue(key, ts.namedValue(key as string))),
      Record.toEntries,
      Arr.map(([_, value]) => value)
    );

    const indexMapFile = ts.file();

    for (const [toolkitName, value] of Record.toEntries(index)) {
      // Note: imports needd to be skipped when generating a single file
      if (params.emitSingleFile) {
        break;
      }

      indexMapFile.addImport(
        ts.moduleImport(`./${value.slug}.${params.importExtension}`).named(toolkitName)
      );
    }

    indexMapFile.add(
      ts
        .moduleExport(
          ts
            .constDeclaration(BARREL_OBJECT_NAME)
            .setValue(ts.objectValue().addMultiple(indexMapEntries))
        )
        .setDocComment(ts.docComment('Map of Composio toolkits to actions.'))
    );

    const indexMapFileSource = ts.stringify(indexMapFile);

    return indexMapFileSource;
  };
}

export function generateToolkitUnionType(index: ToolkitIndex): string {
  const toolkitModules = pipe(
    index,
    Record.toEntries,
    Arr.map(([key, _]) => key)
  );

  const file = ts.file();
  const doc = ts.docComment('Union of all available toolkits.');

  file.add(
    ts
      .moduleExport(
        ts.typeDeclaration(
          'Toolkit',
          toolkitModules.length === 0
            ? ts.neverType
            : ts.unionType(toolkitModules.map(slug => ts.stringLiteral(slug))).formatMultiline()
        )
      )
      .setDocComment(doc)
  );

  return ts.stringify(file);
}

export function generateToolsByToolkitType(): string {
  const file = ts.file();
  const doc = ts.docComment('Given a toolkit, returns the tools available for that toolkit.');

  file.add(
    ts
      .moduleExport(
        ts
          .typeDeclaration(
            'ToolsByToolkit',
            ts.typeOfType(ts.keyType(ts.namedType(BARREL_OBJECT_NAME), ts.namedType('$Toolkit')))
          )
          .addGenericParameter(
            ts
              .genericParameter('$Toolkit')
              .extends(ts.keyOfType(ts.typeOfType(ts.namedType(BARREL_OBJECT_NAME))))
          )
      )
      .setDocComment(doc)
  );

  return ts.stringify(file);
}
