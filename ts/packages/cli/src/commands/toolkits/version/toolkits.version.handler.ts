import { Array as Arr, Effect, Option } from 'effect';
import { reportFailure } from 'src/effects/report-failure';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { idempotent } from 'src/services/composio-request';
import { TerminalUI } from 'src/services/terminal-ui';
import { extractMessage } from 'src/utils/api-error-extraction';
import {
  formatToolkitVersions,
  formatToolkitVersionsJson,
  type ToolkitVersions,
} from './toolkits.version.format';
import { BROWSE_TOOLKITS_HINT } from '../format';

export type ToolkitsVersionParams = {
  readonly slug: string;
};

/** How many of the most recent versions the command prints. */
export const RECENT_VERSIONS_LIMIT = 20;

/**
 * The fields `toolkits version` reads. The response is not validated, so a toolkit that lacks
 * other catalog fields, or its version list, still prints.
 */
export type VersionedToolkit = {
  readonly slug: string;
  readonly name: string;
  readonly meta?: { readonly available_versions?: ReadonlyArray<string> };
};

/** The latest version is the last one the API lists. */
export const toolkitVersionsOf = (toolkit: VersionedToolkit): ToolkitVersions => {
  const availableVersions = toolkit.meta?.available_versions ?? [];
  return {
    slug: toolkit.slug,
    name: toolkit.name,
    latestVersion: Option.getOrNull(Arr.last(availableVersions)),
    recentVersions: availableVersions.slice(-RECENT_VERSIONS_LIMIT),
  };
};

/**
 * Shows a toolkit's latest version and its last 20 available versions. A failed lookup prints the
 * error and a browse hint on stderr and exits 1.
 */
export const runToolkitsVersion = ({ slug }: ToolkitsVersionParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const clientSingleton = yield* ComposioClientSingleton;
    const client = yield* clientSingleton.get();

    const versions = yield* ui
      .withSpinner(
        `Fetching versions for toolkit "${slug}"...`,
        client.toolkits.retrieve(slug, undefined, idempotent)
      )
      .pipe(
        Effect.map(toolkitVersionsOf),
        Effect.catch(error =>
          Effect.gen(function* () {
            yield* Effect.logDebug('Toolkit version error:', error);
            return yield* reportFailure(
              ui,
              extractMessage(error) ?? `Failed to fetch version info for toolkit "${slug}".`,
              BROWSE_TOOLKITS_HINT
            );
          })
        )
      );

    yield* ui.log.message(formatToolkitVersions(versions));
    yield* ui.output(formatToolkitVersionsJson(versions));
  });
