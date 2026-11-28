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
import { Effect, pipe, Record, Match, Array as Arr } from 'effect';
import type { ToolkitName } from 'src/models/toolkits';
import type { ToolkitIndex, ToolkitIndexData } from 'src/generation/create-toolkit-index';
import type { SourceFile } from 'src/generation/types';
import type { TriggerType } from 'src/models/trigger-types';
import {
  generateTypeFromJsonSchema,
  GenerateTypeFromJsonSchemaError,
} from './generate-type-from-json-schema';
import type { PrintTypeOptions } from './json-schema-type';

function toolkitToolInputsTypeMap(
  toolkitName: ToolkitName,
  typeableToolsValue: Record<string, unknown>
) {
  const toolInputTypeEntries = pipe(
    typeableToolsValue,
    Record.map((_, toolName) =>
      ts.property(toolName, ts.namedType(`${toolkitName}_${toolName}_INPUT`))
    ),
    Record.toEntries,
    Arr.map(([_, value]) => value)
  );

  const doc = ts.docComment(
    `Type map of all available tool input types for toolkit "${toolkitName}".`
  );

  return ts
    .moduleExport(
      ts.typeDeclaration(
        `${toolkitName}_TOOL_INPUTS`,
        ts.objectType().addMultiple(toolInputTypeEntries)
      )
    )
    .setDocComment(doc);
}

function toolkitToolOutputsTypeMap(
  toolkitName: ToolkitName,
  typeableToolsValue: Record<string, unknown>
) {
  const toolOutputTypeEntries = pipe(
    typeableToolsValue,
    Record.map((_, toolName) =>
      ts.property(toolName, ts.namedType(`${toolkitName}_${toolName}_OUTPUT`))
    ),
    Record.toEntries,
    Arr.map(([_, value]) => value)
  );

  const doc = ts.docComment(
    `Type map of all available tool input types for toolkit "${toolkitName}".`
  );

  return ts
    .moduleExport(
      ts.typeDeclaration(
        `${toolkitName}_TOOL_OUTPUTS`,
        ts.objectType().addMultiple(toolOutputTypeEntries)
      )
    )
    .setDocComment(doc);
}

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
function _generateTriggerTypeObjectValue(triggerType: TriggerType): ts.ValueBuilder {
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

/** The three files a generated module can be written as. */
export type Flavor = 'typescript' | 'javascript' | 'declarations';

/**
 * One toolkit's generated module. `body` renders one flavor, without the module's
 * imports, which `imports` lists, so a single-file output can write them once at
 * the top; only the flavors a caller asks for are rendered.
 */
export type ToolkitModule = {
  readonly filename: string;
  readonly imports: ReadonlyArray<ts.Import>;
  readonly body: (flavor: Flavor) => string;
};

/** A module's imports followed by its body, laid out as `ts.file()` lays them out. */
export const withImports = (imports: ReadonlyArray<ts.Import>, body: string): string =>
  imports.length === 0 ? body : `${imports.map(item => ts.stringify(item)).join('\n')}\n\n${body}`;

/**
 * Generates a list of TypeScript source files that should be written to disk by the caller.
 */
export function generateTypeScriptToolkitSources(
  banner: string,
  options: PrintTypeOptions = { comments: true }
) {
  return (index: ToolkitIndex) =>
    generateToolkitModules(
      banner,
      options
    )(index).pipe(
      Effect.map(modules =>
        modules.map((module): SourceFile => [
          module.filename,
          withImports(module.imports, module.body('typescript')),
        ])
      )
    );
}

/** Every toolkit's module: TypeScript source, JavaScript, and declaration file. */
export function generateToolkitModules(banner: string, options: PrintTypeOptions) {
  return (
    index: ToolkitIndex
  ): Effect.Effect<Array<ToolkitModule>, GenerateTypeFromJsonSchemaError, never> =>
    Effect.all(
      Record.toEntries(index).map(([key, value]) =>
        generateToolkitModule(banner, options)(key, value)
      )
    );
}

type MapEntry = { name: string; value: string; doc: ts.DocComment | undefined };

/** Each entry of a toolkit map, for its tools and its trigger types: name, value, doc comment. */
const toolkitMapEntries = (
  typeableTools: ToolkitIndexData['typeableTools'],
  triggerTypes: ToolkitIndexData['triggerTypes']
): { toolEntries: Array<MapEntry>; triggerTypeEntries: Array<MapEntry> } => ({
  toolEntries: Match.value(typeableTools).pipe(
    Match.when({ withTypes: true }, ({ value }) =>
      Object.entries(value).map(([toolName, tool]) => ({
        name: toolName,
        value: tool.slug,
        doc: ts.docComment(`${tool.description}`),
      }))
    ),
    Match.when({ withTypes: false }, ({ value }) =>
      Object.entries(value).map(([toolName, tool]) => ({
        name: toolName,
        value: tool,
        doc: undefined,
      }))
    ),
    Match.exhaustive
  ),
  triggerTypeEntries: Object.entries(triggerTypes).map(([triggerTypeSlug, triggerType]) => ({
    name: triggerTypeSlug,
    value: triggerType.slug,
    doc: ts.docComment(`${triggerType.description}`),
  })),
});

function generateToolkitModule(_banner: string, options: PrintTypeOptions) {
  return (
    toolkitName: ToolkitName,
    { slug, version, typeableTools, triggerTypes }: ToolkitIndexData
  ): Effect.Effect<ToolkitModule, GenerateTypeFromJsonSchemaError, never> => {
    return Effect.gen(function* () {
      const filename = `${slug}.ts`;
      // The TypeScript source, the declaration file (its types, with the toolkit
      // map declared instead of defined), and the JavaScript (the toolkit map).
      const typescript = ts.file();
      const declarations = ts.file();
      const javascript = ts.file();
      const addTypes = (item: ts.FileItem) => {
        typescript.add(item);
        declarations.add(item);
      };

      // Add toolkit version comment if a version override was used
      if (version) {
        const comment = ts.docSectionComment(`/* @toolkit-version: ${version} */`);
        addTypes(comment);
        javascript.add(comment);
      }

      // `import { type TriggerEvent } from "@composio/core"`, if there are trigger types
      const imports =
        Object.keys(triggerTypes).length > 0
          ? [ts.moduleImport('@composio/core').named(ts.namedImport('TriggerEvent').typeOnly())]
          : [];

      if (typeableTools.withTypes) {
        addTypes(
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
            tool.input_parameters,
            options
          );

          // e.g., `type GMAIL_SEND_EMAIL_OUTPUT = { .. }`
          const toolOutputType = yield* generateTypeFromJsonSchema(
            `${toolkitName}_${toolName}_OUTPUT`,
            tool.output_parameters,
            options
          );

          addTypes(
            ts
              .typeDeclaration(tool.slug, toolInputType)
              .setDocComment(
                ts.docComment(
                  `Type of ${toolkitName}'s ${tool.slug} tool input.${version ? `\n@toolkit-version: ${version}` : ''}`
                )
              )
          );

          addTypes(
            ts
              .typeDeclaration(tool.slug, toolOutputType)
              .setDocComment(
                ts.docComment(
                  `Type of ${toolkitName}'s ${tool.slug} tool output.${version ? `\n@toolkit-version: ${version}` : ''}`
                )
              )
          );
        }

        // write the map of input tool types
        addTypes(toolkitToolInputsTypeMap(toolkitName, typeableTools.value));

        // write the map of output tool types
        addTypes(toolkitToolOutputsTypeMap(toolkitName, typeableTools.value));
      }

      addTypes(
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
          triggerType.payload,
          options
        );
        addTypes(
          ts
            .typeDeclaration(triggerTypeSlug, triggerPayloadType)
            .setDocComment(
              ts.docComment(`Type of ${toolkitName}'s ${triggerTypeSlug} trigger payload.`)
            )
        );
      }

      const { toolEntries, triggerTypeEntries } = toolkitMapEntries(typeableTools, triggerTypes);

      const entryValue = ({ name, value, doc }: MapEntry) => {
        const entry = ts.propertyValue(name, ts.stringLiteral(value).asValue());
        return doc ? entry.setDocComment(doc) : entry;
      };
      // The declaration file widens each string to `string`.
      const entryType = ({ name, doc }: MapEntry) => {
        const entry = ts.property(name, ts.stringType);
        return doc ? entry.setDocComment(doc) : entry;
      };

      const toolkitValue = ts
        .objectValue()
        .add(ts.propertyValue('slug', ts.stringLiteral(slug).asValue()))
        .add(ts.propertyValue('tools', ts.objectValue().addMultiple(toolEntries.map(entryValue))))
        .add(
          ts.propertyValue(
            'triggerTypes',
            ts.objectValue().addMultiple(triggerTypeEntries.map(entryValue))
          )
        );

      const toolkitType = ts
        .objectType()
        .add(ts.property('slug', ts.stringType))
        .add(ts.property('tools', ts.objectType().addMultiple(toolEntries.map(entryType))))
        .add(
          ts.property(
            'triggerTypes',
            ts.objectType().addMultiple(triggerTypeEntries.map(entryType))
          )
        );

      const toolkitDoc = () =>
        ts.docComment(
          `Map of Composio's ${toolkitName} toolkit.${version ? `\n@toolkit-version: ${version}` : ''}`
        );

      const toolkitMap = ts
        .moduleExport(ts.constDeclaration(toolkitName).setValue(toolkitValue))
        .setDocComment(toolkitDoc());
      typescript.add(toolkitMap);
      javascript.add(toolkitMap);
      declarations.add(
        ts
          .moduleExport(ts.constDeclaration(toolkitName, toolkitType).declare())
          .setDocComment(toolkitDoc())
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

        addTypes(
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

        addTypes(
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

      const files = { typescript, javascript, declarations };
      return { filename, imports, body: flavor => ts.stringify(files[flavor]) };
    });
  };
}
