import { Effect, Option } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { TerminalUI } from 'src/services/terminal-ui';
import { formatAuthConfigInfo } from './auth-configs.info.format';

export type AuthConfigsInfoParams = {
  readonly id: Option.Option<string>;
};

const invalidInput = commandInputError('dev auth-configs info');

/**
 * Show one auth config: the details on stderr, the JSON on stdout. A missing `<id>` fails with a
 * `CommandInputError` before any request; an API failure is reported with a hint and exits 1.
 */
export const runAuthConfigsInfo = ({ id }: AuthConfigsInfoParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    if (Option.isNone(id)) {
      return yield* invalidInput(
        'Missing required argument: <id>\nTry specifying an auth config ID, e.g.:\n> composio dev auth-configs info "ac_1232323"\n\nTo find auth config IDs:\n> composio dev auth-configs list',
        '<id>'
      );
    }

    const idValue = id.value;

    // Auth config IDs are opaque nanoids — "Did you mean?" suggestions would not be useful
    const item = yield* ui
      .withSpinner(`Fetching auth config "${idValue}"...`, repo.getAuthConfig(idValue))
      .pipe(
        Effect.catchTag(
          CLIENT_API_ERROR_TAGS,
          handleClientApiError(ui, {
            fallbackMessage: `Failed to fetch auth config "${idValue}".`,
            hint: 'Browse available auth configs:\n> composio dev auth-configs list',
          })
        )
      );

    yield* ui.note(formatAuthConfigInfo(item), `Auth Config: ${item.name}`);

    yield* ui.output(JSON.stringify(item, null, 2));
  });
