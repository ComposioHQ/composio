import { pipe, String, Record } from 'effect';
import type { Simplify } from 'effect/Types';
import { Toolkit, Toolkits, ToolkitName } from 'src/models/toolkits';
import { Tools } from 'src/models/tools';
import { TriggerType, TriggerTypes } from 'src/models/trigger-types';

const startsWith =
  <const P extends string>(prefix: P) =>
  (str: string): str is `${P}${string}` =>
    str.startsWith(prefix);

interface CreateToolkitIndexInput {
  toolkits: Toolkits; // e.g., [ { slug: 'gmail', ... }]
  tools: Tools; // e.g., [ 'GMAIL_SEND_EMAIL' ]
  triggerTypes: TriggerTypes; // e.g., [ { slug: 'GMAIL_NEW_EMAIL', ... } ]
}

export type ToolkitIndexData = Simplify<{
  slug: string;
  tools: Record<`${ToolkitName}_${string}`, string>;
  triggerTypes: Record<`${ToolkitName}_${string}`, string>;
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
      const tools = value.tools.map(tool => [stripPrefix(tool), tool] as const);
      const triggerTypes = value.triggerTypes.map(
        triggerType => [stripPrefix(triggerType.slug), triggerType.slug] as const
      );

      return [
        key,
        { slug, tools: Record.fromEntries(tools), triggerTypes: Record.fromEntries(triggerTypes) },
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
    tools: Array<`${Uppercase<T>}_${string}`>;
    // triggerTypes: Array<TriggerTypeWithUppercaseSlug<T>>;
    triggerTypes: TriggerTypes;
  },
];

const groupByToolkit =
  <const T extends string>(toolkit: Omit<Toolkit, 'name'> & { name: T }) =>
  ({
    tools,
    triggerTypes,
  }: Omit<CreateToolkitIndexInput, 'toolkits'>): GroupByToolkitOutput<T & ToolkitName> => {
    const toolkitName = pipe(toolkit.slug, String.toUpperCase, ToolkitName) as Uppercase<
      T & ToolkitName
    >;

    return [
      toolkitName,
      {
        toolkit,
        tools: tools.filter(startsWith(`${toolkitName}_`)),
        triggerTypes: triggerTypes.filter(triggerType => {
          console.log('Checking trigger type slug', triggerType?.slug);
          return startsWith(`${toolkitName}_`)(triggerType.slug);
        }), // as Array<TriggerTypeWithUppercaseSlug<T & ToolkitName>>,
      },
    ];
  };

function groupByToolkits({
  toolkits,
  ...rest
}: CreateToolkitIndexInput): GroupByToolkitOutput<ToolkitName>[] {
  return toolkits.map(toolkit => groupByToolkit(toolkit)(rest));
}
