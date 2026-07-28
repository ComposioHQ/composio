import { pipe, String, Record, Match } from 'effect';
import type { Simplify } from 'effect/Types';
import { Toolkit, Toolkits, ToolkitName } from 'src/models/toolkits';
import { ToolsAsEnums, Tools, ToolAsEnum, Tool } from 'src/models/tools';
import { TriggerType, TriggerTypes } from 'src/models/trigger-types';
import type { ToolkitVersionOverrides } from 'src/effects/toolkit-version-overrides';

const startsWith =
  <const P extends string>(prefix: P) =>
  (str: string): str is `${P}${string}` =>
    str.startsWith(prefix);

interface CreateToolkitIndexInput {
  toolkits: Toolkits; // e.g., [ { slug: 'gmail', ... }]
  typeableTools: { withTypes: false; tools: ToolsAsEnums } | { withTypes: true; tools: Tools }; // e.g., [ 'GMAIL_SEND_EMAIL' ] | [ { slug: 'GMAIL_SEND_EMAIL', ... } ]
  triggerTypes: TriggerTypes; // e.g., [ { slug: 'GMAIL_NEW_EMAIL', ... } ]
  /** Map of lowercase toolkit slug to version (only includes non-'latest' versions) */
  versionMap?: ToolkitVersionOverrides;
}

export type ToolkitIndexData = Simplify<{
  slug: string;
  /** Version override for this toolkit (only present if not 'latest') */
  version?: string;
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
  const { versionMap } = input;

  return pipe(
    input,
    groupByToolkits,
    Record.fromEntries,
    Record.mapEntries((value, key) => {
      const stripPrefix = String.slice(key.length + 1);

      const { slug } = value.toolkit;

      // Look up version override for this toolkit (lowercase key lookup)
      const version = versionMap?.get(String.toLowerCase(slug));

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
          // Only include version if it's not 'latest' (i.e., was overridden)
          ...(version ? { version } : {}),
          typeableTools,
          triggerTypes: Record.fromEntries(triggerTypes),
        },
      ] as const;
    })
  );
}

type ToolkitPrefixedSlug = `${ToolkitName}_${string}`;

type TriggerTypeWithToolkitPrefix = Omit<TriggerType, 'slug'> & {
  slug: ToolkitPrefixedSlug;
};

type GroupByToolkitOutput = [
  ToolkitName,
  {
    toolkit: Toolkit;
    typeableTools:
      | { withTypes: false; tools: Array<ToolkitPrefixedSlug> }
      | { withTypes: true; tools: Array<Tool & { slug: ToolkitPrefixedSlug }> };
    triggerTypes: Array<TriggerTypeWithToolkitPrefix>;
  },
];

const hasToolkitSlugPrefix = <A extends { readonly slug: string }>(toolkitName: ToolkitName) => {
  const hasPrefix = startsWith(`${toolkitName}_`);
  return (value: A): value is A & { readonly slug: ToolkitPrefixedSlug } => hasPrefix(value.slug);
};

const groupByToolkit =
  (toolkit: Toolkit) =>
  ({
    typeableTools,
    triggerTypes,
  }: Omit<CreateToolkitIndexInput, 'toolkits'>): GroupByToolkitOutput => {
    const toolkitName = pipe(toolkit.slug, String.toUpperCase, ToolkitName);
    const hasMatchingSlug = hasToolkitSlugPrefix(toolkitName);
    const hasMatchingToolSlug = (
      tool: Tool
    ): tool is Tool & { readonly slug: ToolkitPrefixedSlug } => hasMatchingSlug(tool);
    const hasMatchingTriggerSlug = (
      triggerType: TriggerType
    ): triggerType is TriggerTypeWithToolkitPrefix => hasMatchingSlug(triggerType);

    const filteredTypeableTools = Match.value(typeableTools).pipe(
      Match.when({ withTypes: true }, ({ withTypes, tools }) => ({
        withTypes,
        tools: tools.filter(hasMatchingToolSlug),
      })),
      Match.when({ withTypes: false }, ({ withTypes, tools }) => ({
        withTypes,
        tools: tools.filter(tool => startsWith(`${toolkitName}_`)(tool)),
      })),
      Match.exhaustive
    );

    return [
      toolkitName,
      {
        toolkit,
        typeableTools: filteredTypeableTools,
        triggerTypes: triggerTypes.filter(hasMatchingTriggerSlug),
      },
    ];
  };

function groupByToolkits({ toolkits, ...rest }: CreateToolkitIndexInput): GroupByToolkitOutput[] {
  return toolkits.map(toolkit => groupByToolkit(toolkit)(rest));
}
