import { Command, Options } from '@effect/cli';
import {
  checkLocalToolkitsReadiness,
  formatSupportedPlatforms,
  getLocalToolsMetaPath,
  type LocalReadinessStatus,
  type LocalToolsReadinessReport,
} from '@composio/cli-local-tools';
import { Data, Effect, Option, Predicate } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { bold, gray, green, red } from 'src/ui/colors';
import { truncate } from 'src/ui/truncate';

const json = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print readiness report as JSON')
);

const allPlatforms = Options.boolean('all-platforms').pipe(
  Options.withDefault(false),
  Options.withDescription('Include local toolkits that are not supported on this CLI platform')
);

const strict = Options.boolean('strict').pipe(
  Options.withDefault(false),
  Options.withDescription('Exit with an error when any visible local tool is not ready')
);

const toolkits = Options.text('toolkits').pipe(
  Options.optional,
  Options.withDescription('Filter by local toolkit slugs, comma-separated')
);

export class LocalToolsDoctorError extends Data.TaggedError(
  'commands/local-tools/LocalToolsDoctorError'
)<{
  readonly message: string;
  readonly operation: 'check' | 'strict';
  readonly notReadyTools: ReadonlyArray<string>;
  readonly cause?: unknown;
}> {}

const errorMessage = (error: unknown): string =>
  Predicate.isError(error) ? error.message : String(error);

const parseToolkitFilter = (value: Option.Option<string>): ReadonlyArray<string> | undefined => {
  const raw = Option.getOrUndefined(value);
  if (!raw?.trim()) return undefined;
  return raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
};

const statusIcon = (status: LocalReadinessStatus): string => {
  switch (status) {
    case 'ready':
      return green('✓');
    case 'unsupported':
      return gray('○');
    case 'unknown':
      return gray('?');
    default:
      return red('✗');
  }
};

const statusLabel = (status: LocalReadinessStatus): string => {
  if (status === 'ready') return green(status);
  if (status === 'unsupported' || status === 'unknown') return gray(status);
  return red(status);
};

const notReadyTools = (report: LocalToolsReadinessReport): ReadonlyArray<string> =>
  report.toolkits.flatMap(toolkit =>
    toolkit.tools
      .filter(tool => tool.status !== 'ready' && tool.status !== 'unsupported')
      .map(tool => tool.finalSlug)
  );

const formatDoctorReport = (report: LocalToolsReadinessReport, metadataPath: string): string => {
  const lines: string[] = [];
  lines.push(`${bold('Local tools doctor')} (${report.currentPlatform})`);
  lines.push(`${gray('Metadata:')} ${metadataPath}`);

  if (report.toolkits.length === 0) {
    lines.push('No registered local toolkits match this platform/filter.');
    return lines.join('\n');
  }

  for (const toolkit of report.toolkits) {
    lines.push('');
    lines.push(
      `${statusIcon(toolkit.status)} ${bold(toolkit.slug)} ${gray(`(${toolkit.name}; ${statusLabel(toolkit.status)}; ${formatSupportedPlatforms(toolkit.platforms)})`)}`
    );
    lines.push(`  ${gray(truncate(toolkit.description, 96))}`);
    for (const message of toolkit.messages) {
      lines.push(`  ${gray('note:')} ${message}`);
    }

    for (const tool of toolkit.tools) {
      const command = tool.command
        ? tool.command.found
          ? `${tool.command.command}${tool.command.path ? gray(` -> ${tool.command.path}`) : ''}`
          : `${tool.command.command} ${red('(missing)')}`
        : tool.executionKind;
      lines.push(
        `  ${statusIcon(tool.status)} ${tool.finalSlug.padEnd(36)} ${statusLabel(tool.status).padEnd(15)} ${gray(command)}`
      );
      for (const message of tool.messages) {
        lines.push(`      ${gray(message)}`);
      }
    }

    const hints = [...new Set([...toolkit.hints, ...toolkit.tools.flatMap(tool => tool.hints)])];
    for (const hint of hints) {
      lines.push(`  ${gray('hint:')} ${hint}`);
    }
  }

  return lines.join('\n');
};

export const localToolsCmd$Doctor = Command.make(
  'doctor',
  { json, allPlatforms, strict, toolkits },
  ({ json, allPlatforms, strict, toolkits }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const toolkitFilter = parseToolkitFilter(toolkits);
      const metadataPath = getLocalToolsMetaPath();
      const report = yield* Effect.tryPromise({
        try: () =>
          checkLocalToolkitsReadiness({
            includeUnsupported: allPlatforms,
            toolkits: toolkitFilter,
          }),
        catch: cause =>
          new LocalToolsDoctorError({
            message: errorMessage(cause),
            operation: 'check',
            notReadyTools: [],
            cause,
          }),
      });

      if (json) {
        yield* ui.output(JSON.stringify({ metadataPath, ...report }, null, 2), { force: true });
      } else {
        yield* ui.log.message(formatDoctorReport(report, metadataPath));
      }

      if (strict) {
        const problems = notReadyTools(report);
        if (problems.length > 0) {
          return yield* new LocalToolsDoctorError({
            message: 'One or more local tools are not ready. Run without --strict for setup hints.',
            operation: 'strict',
            notReadyTools: problems,
          });
        }
      }
    })
).pipe(
  Command.withDescription(
    [
      'Check whether registered local toolkits have the commands and platform support needed to run.',
      '',
      'Examples:',
      '  composio local-tools doctor',
      '  composio local-tools doctor --json',
      '  composio local-tools doctor --toolkits <toolkit> --strict',
    ].join('\n')
  )
);
