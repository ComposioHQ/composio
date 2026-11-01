import { Argument, Command, Flag } from 'effect/cli';
import { runToolsList } from './tools.list.handler';

const toolkit = Argument.String('toolkit').pipe(
  Argument.withDescription('Toolkit slug to list tools for (e.g. "gmail")')
);

const query = Flag.String('query').pipe(
  Flag.withDescription('Text search by name, slug, or description'),
  Flag.optional
);

const tags = Flag.String('tags').pipe(
  Flag.withDescription('Filter by tags (e.g. "important")'),
  Flag.optional
);

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(30),
  Flag.withDescription('Number of results per page (1-1000)')
);

export const toolsCmd$List = Command.make(
  'list',
  { toolkit, query, tags, limit },
  runToolsList
).pipe(Command.withDescription('List available tools for a toolkit.'));
