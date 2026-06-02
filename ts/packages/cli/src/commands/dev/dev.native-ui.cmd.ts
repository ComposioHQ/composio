import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { spawn } from 'node:child_process';
import { ensureBundledBinaryExecutable } from '@composio/cli-local-tools';
import { TerminalUI } from 'src/services/terminal-ui';
import { resolveNativeUiBinary } from 'src/services/native-ui-sidecar';

const title = Options.text('title').pipe(
  Options.withDefault('Composio'),
  Options.withDescription('Title for the native sidecar window.')
);

const message = Options.text('message').pipe(
  Options.withDefault('Native UI sidecar scaffold'),
  Options.withDescription('Primary text displayed in the native sidecar window.')
);

const detail = Options.text('detail').pipe(
  Options.withDefault('This window is rendered by a Swift sidecar bundled with the CLI.'),
  Options.withDescription('Secondary text displayed in the native sidecar window.')
);

const timeout = Options.optional(Options.text('timeout')).pipe(
  Options.withDescription('Optional auto-close timeout in seconds.')
);

export const devNativeUiCmd = Command.make('native-ui', { title, message, detail, timeout }).pipe(
  Command.withDescription('Open the experimental native macOS UI sidecar.'),
  Command.withHandler(({ title, message, detail, timeout }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const resolved = resolveNativeUiBinary();

      if (resolved._tag === 'unsupported') {
        yield* ui.log.error(
          `The native UI sidecar is currently only available on macOS (detected ${resolved.platform}).`
        );
        return;
      }

      if (resolved._tag === 'missing') {
        yield* ui.log.error('The native UI sidecar binary was not found.');
        yield* ui.log.step(
          `Build it with: pnpm --filter @composio/cli-local-tools build:composio-native-ui -- --target ${resolved.platform}`
        );
        yield* ui.log.step(`Checked: ${resolved.candidates.join(', ')}`);
        return;
      }

      yield* Effect.tryPromise(() => ensureBundledBinaryExecutable(resolved.binaryPath));

      const args = ['--title', title, '--message', message, '--detail', detail];
      const timeoutValue = Option.getOrUndefined(timeout)?.trim();
      if (timeoutValue) {
        args.push('--timeout', timeoutValue);
      }

      yield* Effect.sync(() => {
        const child = spawn(resolved.binaryPath, args, {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      });

      yield* ui.log.success('Opened native UI sidecar.');
    })
  )
);
