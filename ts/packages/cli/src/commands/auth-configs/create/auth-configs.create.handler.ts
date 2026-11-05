import type { AuthConfigCreateParams as AuthConfigCreateRequest } from '@composio/client/resources/auth-configs';
import { Effect, Option, Result } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { TerminalUI } from 'src/services/terminal-ui';
import { redact } from 'src/ui/redact';
import { parseJsonRecord } from 'src/utils/parse-json';
import { formatAuthConfigCreated } from './auth-configs.create.format';

export type AuthConfigsCreateParams = {
  readonly name: Option.Option<string>;
  readonly toolkit: string;
  readonly authScheme: Option.Option<string>;
  readonly scopes: Option.Option<string>;
  readonly customCredentials: Option.Option<string>;
};

/** `--custom-credentials` as a record, `undefined` when the flag is absent. */
const parseCustomCredentials = (customCredentials: Option.Option<string>) =>
  Option.match(customCredentials, {
    onNone: () => Result.succeed(undefined),
    onSome: parseJsonRecord,
  });

/** `--scopes` split on commas with blanks dropped, `undefined` when the flag is absent. */
export const parseScopes = (scopes: Option.Option<string>): Array<string> | undefined =>
  Option.getOrUndefined(
    Option.map(scopes, value =>
      value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    )
  );

/**
 * The create request: Composio-managed auth without `--auth-scheme`, custom auth with it. Custom
 * credentials and scopes go under `credentials`, the only place the API accepts them; managed
 * auth carries only the scopes.
 */
export const buildAuthConfigCreateRequest = (input: {
  readonly name: string | undefined;
  readonly toolkit: string;
  readonly authScheme: Option.Option<string>;
  readonly scopes: Array<string> | undefined;
  readonly customCredentials: Record<string, unknown> | undefined;
}): AuthConfigCreateRequest =>
  Option.match(input.authScheme, {
    onNone: () => ({
      toolkit: { slug: input.toolkit },
      auth_config: {
        type: 'use_composio_managed_auth' as const,
        name: input.name,
        credentials: input.scopes ? { scopes: input.scopes } : undefined,
      },
    }),
    onSome: authScheme => ({
      toolkit: { slug: input.toolkit },
      auth_config: {
        type: 'use_custom_auth' as const,
        // The API validates the scheme and answers an unknown one with its own error and hint.
        authScheme: authScheme as Extract<
          NonNullable<AuthConfigCreateRequest['auth_config']>,
          { authScheme: unknown }
        >['authScheme'],
        name: input.name,
        credentials:
          input.customCredentials || input.scopes
            ? {
                ...(input.customCredentials ?? {}),
                ...(input.scopes ? { scopes: input.scopes } : {}),
              }
            : undefined,
      },
    }),
  });

const invalidInput = commandInputError('dev auth-configs create');

/**
 * Create an auth config: the summary on stderr, the API response as JSON on stdout. Invalid
 * `--custom-credentials` JSON fails with a `CommandInputError` before any request; an API
 * failure is reported with a hint and exits 1.
 */
export const runAuthConfigsCreate = ({
  name,
  toolkit,
  authScheme,
  scopes,
  customCredentials,
}: AuthConfigsCreateParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    const parsedCustomCredentials = parseCustomCredentials(customCredentials);
    if (Result.isFailure(parsedCustomCredentials)) {
      return yield* invalidInput(
        'Invalid JSON in --custom-credentials. Please provide valid JSON.\nExample:\n> composio dev auth-configs create "name" --toolkit "gmail" --custom-credentials \'{"client_id":"...","client_secret":"..."}\'',
        '--custom-credentials'
      );
    }

    const request = buildAuthConfigCreateRequest({
      name: Option.getOrUndefined(name),
      toolkit,
      authScheme,
      scopes: parseScopes(scopes),
      customCredentials: parsedCustomCredentials.success,
    });

    const result = yield* ui
      .withSpinner('Creating auth config...', repo.createAuthConfig(request))
      .pipe(
        Effect.catchTag(
          CLIENT_API_ERROR_TAGS,
          handleClientApiError(ui, {
            fallbackMessage: 'Failed to create auth config.',
            hint: `Check available auth schemes for "${toolkit}":\n> composio dev toolkits info "${toolkit}"`,
          })
        )
      );

    yield* ui.log.success('Auth config created.');
    yield* ui.note(formatAuthConfigCreated(result), 'New Auth Config');

    const redactedId = redact({ value: result.auth_config.id, prefix: 'ac_' });
    yield* ui.log.step(`To view details:\n> composio dev auth-configs info "${redactedId}"`);

    yield* ui.output(JSON.stringify(result, null, 2));
  });
