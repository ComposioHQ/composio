import { Argument, Command } from 'effect/cli';
import { runTriggersInfo } from './triggers.info.handler';

const slug = Argument.String('slug').pipe(
  Argument.withDescription('Trigger slug (e.g. "GMAIL_NEW_GMAIL_MESSAGE")'),
  Argument.optional
);

export const triggersCmd$Info = Command.make('info', { slug }, runTriggersInfo).pipe(
  Command.withDescription('View details of a specific trigger type.')
);
