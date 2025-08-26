import { pipe, String, Record, Match } from 'effect';
import type { Simplify } from 'effect/Types';
import { Toolkit, Toolkits, ToolkitName } from 'src/models/toolkits';
import { ToolsAsEnums, Tools, ToolAsEnum, Tool } from 'src/models/tools';
import { TriggerType, TriggerTypes } from 'src/models/trigger-types';

const startsWith =
  <const P extends string>(prefix: P) =>
  (str: string): str is `${P}${string}` =>
    str.startsWith(prefix);

interface CreateToolkitIndexInput {
  toolkits: Toolkits; // e.g., [ { slug: 'gmail', ... }]
  typeableTools: { withTypes: false; tools: ToolsAsEnums } | { withTypes: true; tools: Tools }; // e.g., [ 'GMAIL_SEND_EMAIL' ] | [ { slug: 'GMAIL_SEND_EMAIL', ... } ]
  triggerTypes: TriggerTypes; // e.g., [ { slug: 'GMAIL_NEW_EMAIL', ... } ]
}

export type ToolkitIndexData = Simplify<{
  slug: string;
  typeableTools:
    | { withTypes: false; value: Record<`${ToolkitName}_${string}`, ToolAsEnum> }
    | { withTypes: true; value: Record<`${ToolkitName}_${string}`, Tool> };
  triggerTypes: Record<`${ToolkitName}_${string}`, TriggerType>;
}>;

export type ToolkitIndex = Record<ToolkitName, ToolkitIndexData>;

/**
 * Creates a toolkit index from the given input.
 * Tools and triggerTypes are grouped by their corresponding toolkit name,
 * which is found by looking at the prefix of the tool or trigger type.
 */
export function createToolkitIndex(input: CreateToolkitIndexInput): Simplify<ToolkitIndex> {
  return pipe(
    input,
    groupByToolkits,
    Record.fromEntries,
    Record.mapEntries((value, key) => {
      const stripPrefix = String.slice(key.length + 1);

      const { slug } = value.toolkit;

      const typeableTools = Match.value(value.typeableTools).pipe(
        Match.when({ withTypes: true }, ({ withTypes, tools }) => {
          return {
            withTypes,
            value: Record.fromEntries(tools.map(tool => [stripPrefix(tool.slug), tool] as const)),
          };
        }),
        Match.when({ withTypes: false }, ({ withTypes, tools }) => {
          return {
            withTypes,
            value: Record.fromEntries(tools.map(tool => [stripPrefix(tool), tool] as const)),
          };
        }),
        Match.exhaustive
      );

      const triggerTypes = value.triggerTypes.map(
        triggerType => [stripPrefix(triggerType.slug), triggerType] as const
      );

      return [
        key,
        {
          slug,
          typeableTools,
          triggerTypes: Record.fromEntries(triggerTypes),
        },
      ] as const;
    })
  );
}

type TriggerTypeWithUppercaseSlug<T extends ToolkitName> = Omit<TriggerType, 'slug'> & {
  slug: `${Uppercase<T>}_${string}`;
};

type GroupByToolkitOutput<T extends ToolkitName> = [
  Uppercase<T>,
  {
    toolkit: Toolkit;
    typeableTools:
      | { withTypes: false; tools: Array<`${Uppercase<T>}_${string}`> }
      | { withTypes: true; tools: Array<Tool & { slug: `${Uppercase<T>}_${string}` }> };
    triggerTypes: Array<TriggerTypeWithUppercaseSlug<T>>;
  },
];

const groupByToolkit =
  <const T extends string>(toolkit: Omit<Toolkit, 'name'> & { name: T }) =>
  ({
    typeableTools,
    triggerTypes,
  }: Omit<CreateToolkitIndexInput, 'toolkits'>): GroupByToolkitOutput<T & ToolkitName> => {
    const toolkitName = pipe(toolkit.slug, String.toUpperCase, ToolkitName) as Uppercase<
      T & ToolkitName
    >;

    const filteredTypeableTools = Match.value(typeableTools).pipe(
      Match.when({ withTypes: true }, ({ withTypes, tools }) => ({
        withTypes,
        tools: tools.filter(tool => startsWith(`${toolkitName}_`)(tool.slug)) as Array<
          Tool & { slug: `${typeof toolkitName}_${string}` }
        >,
      })),
      Match.when({ withTypes: false }, ({ withTypes, tools }) => ({
        withTypes,
        tools: tools.filter(startsWith(`${toolkitName}_`)),
      })),
      Match.exhaustive
    );

    return [
      toolkitName,
      {
        toolkit,
        typeableTools: filteredTypeableTools,
        triggerTypes: triggerTypes.filter(triggerType =>
          startsWith(`${toolkitName}_`)(triggerType.slug)
        ) as Array<TriggerTypeWithUppercaseSlug<T & ToolkitName>>,
      },
    ];
  };

function groupByToolkits({
  toolkits,
  ...rest
}: CreateToolkitIndexInput): GroupByToolkitOutput<ToolkitName>[] {
  return toolkits.map(toolkit => groupByToolkit(toolkit)(rest));
}
