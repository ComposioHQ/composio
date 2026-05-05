import { Command, Options } from '@effect/cli';
import {
  detectCliPlatform,
  formatSupportedPlatforms,
  getLocalToolkitDeclarations,
  getLocalToolsMetaPath,
  localToolkitDeclarations,
  normalizeLocalToolSlug,
  supportsCliPlatform,
} from '@composio/cli-local-tools';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { bold, gray } from 'src/ui/colors';
import { truncate } from 'src/ui/truncate';

const json = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print local tool declarations as JSON')
);

const allPlatforms = Options.boolean('all-platforms').pipe(
  Options.withDefault(false),
  Options.withDescription('Include local toolkits that are not supported on this CLI platform')
);

const toolkits = Options.text('toolkits').pipe(
  Options.optional,
  Options.withDescription('Filter by local toolkit slugs, comma-separated')
);

const parseToolkitFilter = (value: Option.Option<string>): ReadonlyArray<string> | undefined => {
  const raw = Option.getOrUndefined(value);
  if (!raw?.trim()) return undefined;
  return raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
};

const toolkitMatchesFilter = (
  toolkitSlug: string,
  toolkitFilter: ReadonlyArray<string> | undefined
): boolean => {
  if (!toolkitFilter || toolkitFilter.length === 0) return true;
  const allowed = new Set(toolkitFilter.map(slug => slug.toLowerCase()));
  return allowed.has(toolkitSlug.toLowerCase());
};

const buildLocalToolkitRows = (params: {
  readonly includeAllPlatforms: boolean;
  readonly toolkitFilter?: ReadonlyArray<string>;
}) => {
  const currentPlatform = detectCliPlatform();
  const sourceToolkits = params.includeAllPlatforms
    ? localToolkitDeclarations.filter(toolkit =>
        toolkitMatchesFilter(toolkit.slug, params.toolkitFilter)
      )
    : getLocalToolkitDeclarations({ toolkits: params.toolkitFilter });

  return sourceToolkits.map(toolkit => {
    const toolkitSupported = supportsCliPlatform(toolkit.platforms, currentPlatform);
    return {
      slug: toolkit.slug,
      name: toolkit.name,
      description: toolkit.description,
      platforms: toolkit.platforms,
      supported: toolkitSupported,
      source: toolkit.source,
      tools: toolkit.tools.map(tool => ({
        slug: tool.slug,
        finalSlug: normalizeLocalToolSlug(tool.slug, toolkit.slug),
        name: tool.name,
        description: tool.description,
        platforms: tool.platforms,
        supported: toolkitSupported && supportsCliPlatform(tool.platforms, currentPlatform),
        executionKind: tool.execution.kind,
        tags: tool.tags ?? [],
      })),
    };
  });
};

const formatHumanRows = (
  rows: ReturnType<typeof buildLocalToolkitRows>,
  metaPath: string
): string => {
  const lines: string[] = [];
  const currentPlatform = detectCliPlatform();
  lines.push(`${bold('Local tools')} (${currentPlatform})`);
  lines.push(`${gray('Metadata:')} ${metaPath}`);

  if (rows.length === 0) {
    lines.push('No registered local toolkits match this platform/filter.');
    return lines.join('\n');
  }

  for (const toolkit of rows) {
    const supportLabel = toolkit.supported ? 'supported' : 'unsupported';
    lines.push('');
    lines.push(
      `${bold(toolkit.slug)} ${gray(`(${toolkit.name}; ${supportLabel}; ${formatSupportedPlatforms(toolkit.platforms)})`)}`
    );
    lines.push(`  ${gray(truncate(toolkit.description, 96))}`);
    if (toolkit.source?.repository) {
      lines.push(`  ${gray('source:')} ${toolkit.source.repository}`);
    } else if (toolkit.source?.package) {
      lines.push(`  ${gray('source:')} ${toolkit.source.package}`);
    }

    for (const tool of toolkit.tools) {
      const toolSupport = tool.supported ? '' : ` ${gray('(unsupported)')}`;
      lines.push(
        `  ${tool.finalSlug.padEnd(36)} ${truncate(tool.name, 24).padEnd(24)} ${gray(tool.executionKind)}${toolSupport}`
      );
    }
  }

  return lines.join('\n');
};

export const localToolsCmd$List = Command.make(
  'list',
  { json, allPlatforms, toolkits },
  ({ json, allPlatforms, toolkits }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const toolkitFilter = parseToolkitFilter(toolkits);
      const rows = buildLocalToolkitRows({
        includeAllPlatforms: allPlatforms,
        toolkitFilter,
      });
      const metaPath = getLocalToolsMetaPath();

      const payload = {
        currentPlatform: detectCliPlatform(),
        metadataPath: metaPath,
        toolkits: rows,
      };

      if (json) {
        yield* ui.output(JSON.stringify(payload, null, 2), { force: true });
        return;
      }

      yield* ui.log.message(formatHumanRows(rows, metaPath));
    })
).pipe(
  Command.withDescription(
    [
      'List registered local CLI toolkits and tools that can be injected into Tool Router search sessions.',
      '',
      'Examples:',
      '  composio local-tools list',
      '  composio local-tools list --json',
      '  composio local-tools list --toolkits <toolkit> --all-platforms',
    ].join('\n')
  )
);
