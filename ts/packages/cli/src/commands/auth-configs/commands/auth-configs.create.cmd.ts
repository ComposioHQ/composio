import { Args, Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import type { AuthConfigCreateParams } from '@composio/client/resources/auth-configs';
import { ComposioToolkitsRepository, HttpServerError } from 'src/services/composio-clients';
import { ComposioUserContext } from 'src/services/user-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { formatAuthConfigCreated } from '../format';

const name = Args.text({ name: 'name' }).pipe(
  Args.withDescription('Display name for the auth config'),
  Args.optional
);

const toolkit = Options.text('toolkit').pipe(
  Options.withDescription('Toolkit slug (e.g. "gmail")')
);

const authScheme = Options.text('auth-scheme').pipe(
  Options.withDescription(
    'Auth scheme (e.g. OAUTH2, API_KEY, BEARER_TOKEN). If omitted, uses Composio managed defaults.'
  ),
  Options.optional
);

const scopes = Options.text('scopes').pipe(
  Options.withDescription('Comma-separated scopes (OAuth only, e.g. "send_email,read_email")'),
  Options.optional
);

const customCredentials = Options.text('custom-credentials').pipe(
  Options.withDescription('Custom credentials as JSON string (for white-labeling)'),
  Options.optional
);

/**
 * Create a new auth config.
 *
 * @example
 * ```bash
 * # Composio-managed defaults
 * composio auth-configs create "my-gmail-config" --toolkit "gmail"
 *
 * # Custom auth with specific scheme
 * composio auth-configs create "custom-gmail" --toolkit "gmail" --auth-scheme "OAUTH2" --scopes "send_email"
 *
 * # White-labeling with custom credentials
 * composio auth-configs create "custom-gmail" --toolkit "gmail" --auth-scheme "OAUTH2" --custom-credentials '{"client_id":"...","client_secret":"..."}'
 * ```
 */
export const authConfigsCmd$Create = Command.make(
  'create',
  { name, toolkit, authScheme, scopes, customCredentials },
  ({ name, toolkit, authScheme, scopes, customCredentials }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const ctx = yield* ComposioUserContext;
      const repo = yield* ComposioToolkitsRepository;

      // Auth guard
      if (Option.isNone(ctx.data.apiKey)) {
        yield* ui.log.warn('You are not logged in yet. Please run `composio login`.');
        return;
      }

      // Parse custom credentials JSON if provided
      let parsedCustomCredentials: Record<string, unknown> | undefined;
      if (Option.isSome(customCredentials)) {
        try {
          parsedCustomCredentials = JSON.parse(customCredentials.value) as Record<string, unknown>;
        } catch {
          yield* ui.log.error('Invalid JSON in --custom-credentials. Please provide valid JSON.');
          yield* ui.log.step(
            'Example:\n> composio auth-configs create "name" --toolkit "gmail" --custom-credentials \'{"client_id":"...","client_secret":"..."}\''
          );
          return;
        }
      }

      // Parse scopes into array
      const scopesList = Option.isSome(scopes)
        ? scopes.value
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : undefined;

      // Build create params based on whether auth scheme is provided
      const nameValue = Option.getOrUndefined(name);
      let params: AuthConfigCreateParams;

      if (Option.isSome(authScheme)) {
        // Custom auth mode
        params = {
          toolkit: { slug: toolkit },
          auth_config: {
            type: 'use_custom_auth' as const,
            authScheme: authScheme.value as AuthConfigCreateParams.UnionMember1['authScheme'],
            name: nameValue,
            credentials: scopesList ? { scopes: scopesList } : undefined,
            ...parsedCustomCredentials,
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
          Effect.catchTag('services/HttpServerError', (e: HttpServerError) =>
            Effect.gen(function* () {
              if (e.details) {
                yield* ui.log.error(e.details.message);
                yield* ui.log.step(e.details.suggestedFix);
              } else {
                yield* ui.log.error('Failed to create auth config.');
              }

              yield* ui.log.step(
                `Check available auth schemes for "${toolkit}":\n> composio toolkits info "${toolkit}"`
              );

              return Option.none();
            })
          )
        );

      if (Option.isNone(resultOpt)) {
        return;
      }

      const result = resultOpt.value;

      yield* ui.log.success('Auth config created.');
      yield* ui.note(formatAuthConfigCreated(result), 'New Auth Config');

      // Next step hint
      yield* ui.log.step(
        `To view details:\n> composio auth-configs info "${result.auth_config.id}"`
      );

      yield* ui.output(JSON.stringify(result, null, 2));
    })
).pipe(Command.withDescription('Create a new auth config.'));
