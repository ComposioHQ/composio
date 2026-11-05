import { Argument, Command } from 'effect/cli';
import { runToolsInfo } from './tools.info.handler';

const slug = Argument.String('slug').pipe(
  Argument.withDescription('Tool slug (e.g. "GMAIL_SEND_EMAIL")'),
  Argument.optional
);

export const toolsCmd$Info = Command.make('info', { slug }, runToolsInfo).pipe(
  Command.withDescription(
    'View a brief summary of a tool and show the CLI-facing input schema used by `composio execute`.'
  )
);
