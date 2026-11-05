import { Argument, Command, Flag } from 'effect/cli';
import { runAuthConfigsCreate } from './auth-configs.create.handler';

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
  runAuthConfigsCreate
).pipe(Command.withDescription('Create a new auth config.'));
