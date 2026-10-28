import { withCommandMeta } from 'src/invocation/command-identity';
import { Argument, Command, Flag } from 'effect/cli';
import { runProxy } from './proxy.handler';

const endpoint = Argument.String('url').pipe(
  Argument.withDescription('Absolute or relative API endpoint to call through proxy execute.')
);

const toolkit = Flag.String('toolkit').pipe(
  Flag.withAlias('t'),
  Flag.withDescription('Toolkit slug whose connected account should be used')
);

const account = Flag.String('account').pipe(
  Flag.withDescription(
    'Connected account selector. Matches alias, word_id, or connected account id for the toolkit.'
  ),
  Flag.optional
);

const method = Flag.String('method').pipe(
  Flag.withAlias('X'),
  Flag.withDefault('GET'),
  Flag.withDescription('HTTP method, curl-style (GET, POST, PUT, DELETE, PATCH)')
);

const headers = Flag.String('header').pipe(
  Flag.withAlias('H'),
  Flag.withDescription('Header in "Name: value" format. Repeat for multiple headers.'),
  Flag.atLeast(0)
);

const data = Flag.String('data').pipe(
  Flag.withAlias('d'),
  Flag.withDescription('Request body as raw text, JSON, @file, or - for stdin'),
  Flag.optional
);

const skipConnectionCheck = Flag.Boolean('skip-connection-check').pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    'Skip the short-lived connected-account fail-fast check if you just connected an account'
  )
);

export const proxyCmd = Command.make(
  'proxy',
  {
    endpoint,
    toolkit,
    account,
    method,
    headers,
    data,
    skipConnectionCheck,
  },
  runProxy
).pipe(
  Command.withDescription(
    'curl-like access to any toolkit API through Composio using your connected account.\nComposio handles authentication — just provide the full URL and toolkit.'
  ),
  Command.withShortDescription(
    'curl-like access to any toolkit API through Composio using your connected account.'
  ),
  Command.withExamples([
    {
      command:
        'composio proxy https://gmail.googleapis.com/gmail/v1/users/me/profile --toolkit gmail --account work',
    },
    {
      command:
        'composio proxy https://gmail.googleapis.com/gmail/v1/users/me/drafts --toolkit gmail \\\n  -X POST -H \'content-type: application/json\' -d \'{"message":{"raw":"..."}}\'',
    },
  ]),
  withCommandMeta({ requiresLogin: true })
);
