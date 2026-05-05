import { Command, Options } from '@effect/cli';
import {
  createEmptyLocalToolsMeta,
  getLocalToolsMetaPath,
  readLocalToolsMeta,
  writeLocalToolsMeta,
} from '@composio/cli-local-tools';
import { Effect } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { bold, gray } from 'src/ui/colors';

const json = Options.boolean('json').pipe(
  Options.withDefault(false),
  Options.withDescription('Print the metadata file contents as JSON')
);

const init = Options.boolean('init').pipe(
  Options.withDefault(false),
  Options.withDescription('Create ~/composio/local_tools.json if it does not exist')
);

export const localToolsCmd$Meta = Command.make('meta', { json, init }, ({ json, init }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const metadataPath = getLocalToolsMetaPath();
    const meta = init
      ? yield* Effect.tryPromise(async () => {
          const existing = await readLocalToolsMeta();
          const next =
            Object.keys(existing.tools).length === 0 && Object.keys(existing.toolkits).length === 0
              ? createEmptyLocalToolsMeta()
              : existing;
          await writeLocalToolsMeta(next);
          return next;
        })
      : yield* Effect.tryPromise(() => readLocalToolsMeta());

    const payload = {
      metadataPath,
      ...meta,
    };

    if (json) {
      yield* ui.output(JSON.stringify(payload, null, 2), { force: true });
      return;
    }

    yield* ui.log.message(
      [
        `${bold('Local tools metadata')}`,
        `${gray('Path:')} ${metadataPath}`,
        `${gray('Version:')} ${meta.version}`,
        `${gray('Toolkits:')} ${Object.keys(meta.toolkits).length}`,
        `${gray('Tools:')} ${Object.keys(meta.tools).length}`,
        init ? `${gray('Status:')} initialized` : undefined,
        '',
        'Use this file for local auth/install state, for example:',
        '{',
        '  "toolkits": {',
        '    "example_toolkit": { "installation": { "command": "/path/to/tool" } }',
        '  },',
        '  "tools": {',
        '    "LOCAL_EXAMPLE_TOOLKIT_RUN": { "authenticated": true }',
        '  }',
        '}',
      ]
        .filter((line): line is string => line !== undefined)
        .join('\n')
    );
  })
).pipe(
  Command.withDescription(
    [
      'Inspect or initialize the local tools metadata file at ~/composio/local_tools.json.',
      '',
      'Examples:',
      '  composio local-tools meta',
      '  composio local-tools meta --init',
      '  composio local-tools meta --json',
    ].join('\n')
  )
);
