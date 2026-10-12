import { Command } from 'effect/unstable/cli';
import { Data, Effect, Option } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { renderCommandHintGraph } from 'src/services/command-hints';
import { ComposioUserContext } from 'src/services/user-context';
import { detectMasterFromHost } from 'src/services/master-detector';
import {
  formatResolveCommandProjectError,
  resolveCommandProject,
} from 'src/services/command-project';

class DebugCommandError extends Data.TaggedError('commands/DebugCommandError')<{
  readonly message: string;
}> {}

const printCommandHintGraph = Effect.suspend(() =>
  Effect.flatMap(TerminalUI, ui =>
    ui.output(JSON.stringify(renderCommandHintGraph(), null, 2), { force: true })
  )
);

const printDebugApiInfo = Effect.gen(function* () {
  const ui = yield* TerminalUI;
  const confirmed = yield* ui.confirm(
    'This will print your current CLI API key and scoped identifiers to stdout. Continue?',
    { defaultValue: false }
  );
  if (!confirmed) {
    return yield* new DebugCommandError({ message: 'Aborted printing API credentials.' });
  }
  const ctx = yield* ComposioUserContext;
  const apiKey = Option.getOrUndefined(ctx.data.apiKey);
  if (!apiKey) {
    return yield* new DebugCommandError({
      message: 'No user API key found in the current CLI session.',
    });
  }
  const orgId = Option.getOrUndefined(ctx.data.orgId);
  const consumerProject = yield* resolveCommandProject({ mode: 'consumer' }).pipe(
    Effect.mapError(formatResolveCommandProjectError),
    Effect.option
  );
  return yield* ui.output(
    JSON.stringify(
      {
        apiKey,
        orgId: orgId ?? null,
        consumerUserId:
          Option.isSome(consumerProject) && consumerProject.value.projectType === 'CONSUMER'
            ? (consumerProject.value.consumerUserId ?? null)
            : null,
      },
      null,
      2
    ),
    { force: true }
  );
});

const printDetectedMaster = Effect.gen(function* () {
  const ui = yield* TerminalUI;
  const master = yield* detectMasterFromHost;
  yield* ui.output(JSON.stringify({ master }, null, 2), { force: true });
});

export const debugCmd = Command.make('debug').pipe(
  Command.unlisted,
  Command.withDescription('Internal CLI diagnostics.'),
  Command.withSubcommands([
    Command.make('generate-graph', {}, () => printCommandHintGraph).pipe(Command.unlisted),
    Command.make('api-info', {}, () => printDebugApiInfo).pipe(Command.unlisted),
    Command.make('who-is-my-master', {}, () => printDetectedMaster).pipe(Command.unlisted),
  ])
);
