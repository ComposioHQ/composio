import { Effect, Option, Result } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import type { AuthConfigCreateParams } from '@composio/client/resources/auth-configs';
import { parseJsonRecord } from 'src/utils/parse-json';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { redact } from 'src/ui/redact';
import { formatAuthConfigCreated } from '../format';

const name = Argument.String('name').pipe(
  Argument.withDescription('Display name for the auth config'),
  Argument.optional
);

const toolkit = Flag.String('toolkit').pipe(Flag.withDescription('Toolkit slug (e.g. "gmail")'));

const authScheme = Flag.String('auth-scheme').pipe(
  Flag.withDescription(
    'Auth scheme (e.g. OAUTH2, API_KEY, BEARER_TOKEN). If omitted, uses Composio managed defaults.'
  ),
  Flag.optional
);

const scopes = Flag.String('scopes').pipe(
  Flag.withDescription('Comma-separated scopes (OAuth only, e.g. "send_email,read_email")'),
  Flag.optional
);

const customCredentials = Flag.String('custom-credentials').pipe(
  Flag.withDescription('Custom credentials as JSON string (for white-labeling)'),
  Flag.optional
);

/**
 * Create a new auth config.
 *
 * @example
 * ```bash
 * # Composio-managed defaults
 * composio dev auth-configs create "my-gmail-config" --toolkit "gmail"
 *
 * # Custom auth with specific scheme
 * composio dev auth-configs create "custom-gmail" --toolkit "gmail" --auth-scheme "OAUTH2" --scopes "send_email"
 *
 * # White-labeling with custom credentials
 * composio dev auth-configs create "custom-gmail" --toolkit "gmail" --auth-scheme "OAUTH2" --custom-credentials '{"client_id":"...","client_secret":"..."}'
 * ```
 */
export const authConfigsCmd$Create = Command.make(
  'create',
  { name, toolkit, authScheme, scopes, customCredentials },
  ({ name, toolkit, authScheme, scopes, customCredentials }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const repo = yield* ComposioToolkitsRepository;

      // Parse custom credentials JSON if provided
      let parsedCustomCredentials: Record<string, unknown> | undefined;
      if (Option.isSome(customCredentials)) {
        const parsed = parseJsonRecord(customCredentials.value);
        if (Result.isFailure(parsed)) {
          yield* ui.log.error('Invalid JSON in --custom-credentials. Please provide valid JSON.');
          yield* ui.log.step(
            'Example:\n> composio dev auth-configs create "name" --toolkit "gmail" --custom-credentials \'{"client_id":"...","client_secret":"..."}\''
          );
          return;
        }
        parsedCustomCredentials = parsed.success;
      }

      // Parse scopes into array
      const scopesList = Option.getOrUndefined(
        Option.map(scopes, value =>
          value
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        )
      );

      // Build create params based on whether auth scheme is provided
      const nameValue = Option.getOrUndefined(name);
      let params: AuthConfigCreateParams;

      if (Option.isSome(authScheme)) {
        // Custom credentials must be nested under `credentials` for the API to accept them.
        params = {
          toolkit: { slug: toolkit },
          auth_config: {
            type: 'use_custom_auth' as const,
            authScheme: authScheme.value as Extract<
              NonNullable<AuthConfigCreateParams['auth_config']>,
              { authScheme: unknown }
            >['authScheme'],
            name: nameValue,
            credentials:
              parsedCustomCredentials || scopesList
                ? {
                    ...(parsedCustomCredentials ?? {}),
                    ...(scopesList ? { scopes: scopesList } : {}),
                  }
                : undefined,
          },
        };
      } else {
        // Composio managed mode
        params = {
          toolkit: { slug: toolkit },
          auth_config: {
            type: 'use_composio_managed_auth' as const,
            name: nameValue,
            credentials: scopesList ? { scopes: scopesList } : undefined,
          },
        };
      }

      const resultOpt = yield* ui
        .withSpinner('Creating auth config...', repo.createAuthConfig(params))
        .pipe(
          Effect.asSome,
          Effect.catchTag(
            CLIENT_API_ERROR_TAGS,
            handleClientApiError(ui, {
              fallbackMessage: 'Failed to create auth config.',
              hint: `Check available auth schemes for "${toolkit}":\n> composio dev toolkits info "${toolkit}"`,
              fallbackValue: Option.none(),
            })
          )
        );

      if (Option.isNone(resultOpt)) {
        return;
      }

      const result = resultOpt.value;

      yield* ui.log.success('Auth config created.');
      yield* ui.note(formatAuthConfigCreated(result), 'New Auth Config');

      const redactedId = redact({ value: result.auth_config.id, prefix: 'ac_' });

      // Next step hint
      yield* ui.log.step(`To view details:\n> composio dev auth-configs info "${redactedId}"`);

      yield* ui.output(JSON.stringify(result, null, 2));
    })
).pipe(Command.withDescription('Create a new auth config.'));
