import { Command, Flag } from 'effect/unstable/cli';
import { Data, Effect, Option, Predicate } from 'effect';
import { ensureBundledBinaryExecutable } from '@composio/cli-local-tools';
import { spawnDetached } from 'src/services/detached-process';
import { TerminalUI } from 'src/services/terminal-ui';
import { resolveNativeUiBinary } from 'src/services/native-ui-sidecar';

class NativeUiSetupError extends Data.TaggedError('commands/NativeUiSetupError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

const title = Flag.string('title').pipe(
  Flag.withDefault('Composio'),
  Flag.withDescription('Title for the native sidecar window.')
);

const message = Flag.string('message').pipe(
  Flag.withDefault('Native UI sidecar scaffold'),
  Flag.withDescription('Primary text displayed in the native sidecar window.')
);

const detail = Flag.string('detail').pipe(
  Flag.withDefault('This window is rendered by a Swift sidecar bundled with the CLI.'),
  Flag.withDescription('Secondary text displayed in the native sidecar window.')
);

const timeout = Flag.optional(Flag.string('timeout')).pipe(
  Flag.withDescription('Optional auto-close timeout in seconds.')
);

export const devNativeUiCmd = Command.make('native-ui', { title, message, detail, timeout }).pipe(
  Command.withDescription('Open the experimental native macOS UI sidecar.'),
  Command.withHandler(({ title, message, detail, timeout }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const resolved = yield* resolveNativeUiBinary;

      if (Predicate.isTagged(resolved, 'unsupported')) {
        yield* ui.log.error(
          `The native UI sidecar is currently only available on macOS (detected ${resolved.platform}).`
        );
        return;
      }

      if (Predicate.isTagged(resolved, 'missing')) {
        yield* ui.log.error('The native UI sidecar binary was not found.');
        yield* ui.log.step(
          `Build it with: pnpm --filter @composio/cli-local-tools build:composio-native-ui -- --target ${resolved.platform}`
        );
        yield* ui.log.step(`Checked: ${resolved.candidates.join(', ')}`);
        return;
      }

      yield* Effect.tryPromise({
        try: () => ensureBundledBinaryExecutable(resolved.binaryPath),
        catch: cause =>
          new NativeUiSetupError({
            message: `Failed to make the native UI sidecar binary executable: ${resolved.binaryPath}`,
            cause,
          }),
      });

      const args = ['--title', title, '--message', message, '--detail', detail];
      const timeoutValue = Option.getOrUndefined(timeout)?.trim();
      if (timeoutValue) {
        args.push('--timeout', timeoutValue);
      }

      // The sidecar window must outlive the CLI process, so it goes through
      // the sanctioned detached-spawn boundary instead of @effect/platform
      // Command (whose processes are killed when their scope closes).
      yield* spawnDetached(resolved.binaryPath, args);

      yield* ui.log.success('Opened native UI sidecar.');
    })
  )
);
