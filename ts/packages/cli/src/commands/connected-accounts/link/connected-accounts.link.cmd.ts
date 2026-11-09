import { telemetry, withCommandTelemetry } from 'src/analytics/command-input';
import { Argument, Command, Flag } from 'effect/cli';
import { withCommandMeta } from 'src/invocation/command-identity';
import { runConnectedAccountsLink } from './connected-accounts.link.handler';

const toolkit = Argument.String('toolkit').pipe(
  Argument.withDescription('Toolkit slug to link (e.g. "github", "gmail")'),
  Argument.optional
);

const authConfig = Flag.String('auth-config').pipe(
  Flag.withDescription('Auth config ID (e.g. "ac_..."). Uses legacy flow (no Tool Router).'),
  Flag.optional
);

const noWait = Flag.Boolean('no-wait').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Do not wait for authorization; only print link info')
);

const noBrowser = Flag.Boolean('no-browser').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Do not open the browser automatically; print the URL to open manually')
);

const alias = Flag.String('alias').pipe(
  Flag.withDescription(
    'Alias to assign to the connected account. Required when creating an additional account for the same toolkit/auth config.'
  ),
  Flag.optional
);

const list = Flag.Boolean('list').pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    'List existing connected accounts for the toolkit instead of creating a new link'
  )
);

const linkExamples = [
  {
    command: 'composio link github',
  },
  {
    command: 'composio link gmail --alias work',
  },
  {
    command: 'composio link github --list',
  },
];

const connectedAccountsCmd$LinkBase = Command.make(
  'link',
  { toolkit, authConfig, noWait, noBrowser, alias, list },
  runConnectedAccountsLink
).pipe(
  Command.withDescription(
    'Connect an external account (GitHub, Gmail, Slack, etc.) so tools can act on your behalf.\nOpens a browser for OAuth authorization and waits for confirmation.'
  ),
  Command.withShortDescription(
    'Connect an external account (GitHub, Gmail, Slack, etc.) so tools can act on your behalf.'
  ),
  Command.withExamples(linkExamples),
  withCommandMeta({ requiresLogin: true })
);

export const connectedAccountsCmd$Link = withCommandTelemetry(
  connectedAccountsCmd$LinkBase,
  input =>
    telemetry.fields(
      {
        no_browser: telemetry.flag('--no-browser', input.noBrowser),
        no_wait: telemetry.flag('--no-wait', input.noWait),
        has_auth_config: telemetry.flag('--auth-config', telemetry.present(input.authConfig)),
      },
      telemetry.optional(input.toolkit)
    )
);
