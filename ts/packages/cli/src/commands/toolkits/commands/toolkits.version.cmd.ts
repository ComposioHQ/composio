import { Args, Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { requireAuth } from 'src/effects/require-auth';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { extractMessage } from 'src/utils/api-error-extraction';

const slug = Args.text({ name: 'slug' }).pipe(Args.withDescription('Toolkit slug (e.g. "gmail")'));

/**
 * Show toolkit version information.
 *
 * Fetches toolkit data via `client.toolkits.retrieve(slug)` and prints:
 * - latest available version
 * - last 20 available versions
 */
export const toolkitsCmd$Version = Command.make('version', { slug }, ({ slug }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const clientSingleton = yield* ComposioClientSingleton;
    const client = yield* clientSingleton.get();

    const toolkitOpt = yield* ui
      .withSpinner(
        `Fetching versions for toolkit "${slug}"...`,
        Effect.tryPromise({
          try: () => client.toolkits.retrieve(slug),
          catch: error => (error instanceof Error ? error : new Error(String(error))),
        })
      )
      .pipe(
        Effect.asSome,
        Effect.catchAll(error =>
          Effect.gen(function* () {
            const message =
              extractMessage(error) ?? `Failed to fetch version info for toolkit "${slug}".`;
            yield* ui.log.error(message);
            yield* Effect.logDebug('Toolkit version error:', error);
            yield* ui.log.step('Browse available toolkits:\n> composio manage toolkits list');
            return Option.none();
          })
        )
      );

    if (Option.isNone(toolkitOpt)) return;

    const toolkit = toolkitOpt.value as {
      slug: string;
      name: string;
      meta?: { available_versions?: ReadonlyArray<string> };
    };
    const availableVersions = toolkit.meta?.available_versions ?? [];
    const latestVersion = availableVersions.at(-1) ?? null;
    const recentVersions = availableVersions.slice(-20);

    const recentVersionLines =
      recentVersions.length > 0
        ? recentVersions.map(version => `- ${version}`).join('\n')
        : '- none';

    yield* ui.log.message(
      [
        `Toolkit: ${toolkit.name} (${toolkit.slug})`,
        `Latest Version: ${latestVersion ?? 'none'}`,
        `Last ${Math.min(20, recentVersions.length)} Available Versions:`,
        recentVersionLines,
      ].join('\n')
    );

    yield* ui.output(
      JSON.stringify(
        {
          slug: toolkit.slug,
          latest_version: latestVersion,
          available_versions_last_20: recentVersions,
        },
        null,
        2
      )
    );
  })
).pipe(Command.withDescription('Show latest and recent versions for a toolkit.'));
