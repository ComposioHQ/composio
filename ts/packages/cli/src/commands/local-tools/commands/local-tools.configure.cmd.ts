import { Args, Command, Options } from '@effect/cli';
import {
  getLocalToolsMetaPath,
  isLocalToolkitSlug,
  resolveLocalTool,
  updateLocalToolkitMeta,
  updateLocalToolMeta,
  type LocalToolMetaEntry,
} from '@composio/cli-local-tools';
import { Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { bold, gray } from 'src/ui/colors';

const selector = Args.text({ name: 'selector' }).pipe(
  Args.withDescription('Local toolkit slug or LOCAL_* tool slug to configure')
);

const command = Options.text('command').pipe(
  Options.optional,
  Options.withDescription('Override the local binary/launcher command')
);

const disable = Options.boolean('disable').pipe(
  Options.withDefault(false),
  Options.withDescription('Disable this local toolkit/tool')
);

const enable = Options.boolean('enable').pipe(
  Options.withDefault(false),
  Options.withDescription('Enable this local toolkit/tool by clearing disabled=false')
);

const authenticated = Options.boolean('authenticated').pipe(
  Options.withDefault(false),
  Options.withDescription('Mark this local toolkit/tool as authenticated in metadata')
);

const unauthenticated = Options.boolean('unauthenticated').pipe(
  Options.withDefault(false),
  Options.withDescription('Mark this local toolkit/tool as unauthenticated in metadata')
);

const json = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print the updated metadata entry as JSON')
);

type ConfigureTarget =
  | {
      readonly kind: 'toolkit';
      readonly key: string;
      readonly label: string;
    }
  | {
      readonly kind: 'tool';
      readonly key: string;
      readonly label: string;
      readonly toolkitSlug: string;
    };

const resolveTarget = (value: string): ConfigureTarget | null => {
  const localTool = resolveLocalTool(value, { includeUnsupported: true });
  if (localTool) {
    return {
      kind: 'tool',
      key: localTool.finalSlug,
      label: localTool.finalSlug,
      toolkitSlug: localTool.toolkit.slug,
    };
  }

  if (isLocalToolkitSlug(value)) {
    return {
      kind: 'toolkit',
      key: value.toLowerCase(),
      label: value.toUpperCase(),
    };
  }

  return null;
};

const buildPatch = (params: {
  readonly command: Option.Option<string>;
  readonly disable: boolean;
  readonly enable: boolean;
  readonly authenticated: boolean;
  readonly unauthenticated: boolean;
}): LocalToolMetaEntry | { readonly error: string } => {
  if (params.disable && params.enable) {
    return { error: 'Pass only one of --disable or --enable.' };
  }
  if (params.authenticated && params.unauthenticated) {
    return { error: 'Pass only one of --authenticated or --unauthenticated.' };
  }

  const commandOverride = Option.getOrUndefined(params.command)?.trim();
  const hasCommandOverride = commandOverride !== undefined && commandOverride.length > 0;
  const hasChanges =
    hasCommandOverride ||
    params.disable ||
    params.enable ||
    params.authenticated ||
    params.unauthenticated;
  if (!hasChanges) {
    return {
      error:
        'Nothing to configure. Pass --command, --enable/--disable, or --authenticated/--unauthenticated.',
    };
  }

  return {
    ...(hasCommandOverride ? { installation: { command: commandOverride } } : {}),
    ...(params.disable ? { disabled: true } : {}),
    ...(params.enable ? { disabled: false } : {}),
    ...(params.authenticated ? { authenticated: true } : {}),
    ...(params.unauthenticated ? { authenticated: false } : {}),
  };
};

const formatEntry = (target: ConfigureTarget, entry: LocalToolMetaEntry, metadataPath: string) =>
  [
    `${bold('Target:')} ${target.kind} ${target.label}`,
    `${bold('Path:')} ${metadataPath}`,
    `${bold('Command:')} ${entry.installation?.command ?? '-'}`,
    `${bold('Disabled:')} ${entry.disabled === undefined ? '-' : String(entry.disabled)}`,
    `${bold('Authenticated:')} ${entry.authenticated === undefined ? '-' : String(entry.authenticated)}`,
    `${gray('Next:')} run \`composio local-tools doctor --toolkits ${target.kind === 'toolkit' ? target.key : target.toolkitSlug}\``,
  ].join('\n');

export const localToolsCmd$Configure = Command.make(
  'configure',
  { selector, command, disable, enable, authenticated, unauthenticated, json },
  ({ selector, command, disable, enable, authenticated, unauthenticated, json }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const target = resolveTarget(selector);
      if (!target) {
        return yield* Effect.fail(
          new Error(
            `Unknown local toolkit/tool "${selector}". Run \`composio local-tools list --all-platforms\` to inspect valid selectors.`
          )
        );
      }

      const patch = buildPatch({ command, disable, enable, authenticated, unauthenticated });
      if ('error' in patch) {
        return yield* Effect.fail(new Error(patch.error));
      }

      const metadata = yield* Effect.tryPromise(() =>
        target.kind === 'toolkit'
          ? updateLocalToolkitMeta(target.key, patch)
          : updateLocalToolMeta(target.key, patch)
      );
      const entry =
        target.kind === 'toolkit' ? metadata.toolkits[target.key]! : metadata.tools[target.key]!;
      const metadataPath = getLocalToolsMetaPath();
      const payload = { metadataPath, target, entry };

      if (json) {
        yield* ui.output(JSON.stringify(payload, null, 2), { force: true });
        return;
      }

      yield* ui.log.success(`Updated local ${target.kind} metadata.`);
      yield* ui.log.message(formatEntry(target, entry, metadataPath));
    })
).pipe(
  Command.withDescription(
    [
      'Configure local toolkit/tool metadata without hand-editing ~/composio/local_tools.json.',
      '',
      'Examples:',
      '  composio local-tools configure <toolkit> --command /path/to/tool',
      '  composio local-tools configure LOCAL_EXAMPLE_RUN --disable',
      '  composio local-tools configure <toolkit> --authenticated --json',
    ].join('\n')
  )
);
