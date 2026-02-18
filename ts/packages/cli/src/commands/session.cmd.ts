import { Command, Options } from '@effect/cli';
import { Console, Effect, Option } from 'effect';
import { ComposioEntitiesRepository } from 'src/services/composio-entities';

function asString(input: unknown): string | undefined {
  return typeof input === 'string' ? input : undefined;
}

const sessionIdOpt = Options.text('session_id').pipe(
  Options.withDescription('Tool Router session id to operate on (example: trs_123456789).')
);

const toolkitOpt = Options.text('toolkit').pipe(
  Options.withDescription('Toolkit slug for which an auth link should be created (example: gmail).')
);

const callbackUrlOpt = Options.optional(Options.text('callback_url')).pipe(
  Options.withDescription('Optional callback URL used after the toolkit auth flow completes.')
);

const sessionLinkCmd = Command.make(
  'link',
  { sessionIdOpt, toolkitOpt, callbackUrlOpt },
  ({ sessionIdOpt, toolkitOpt, callbackUrlOpt }) =>
    Effect.gen(function* () {
      const repo = yield* ComposioEntitiesRepository;

      const response = yield* repo.toolRouterSessionLink(sessionIdOpt, {
        toolkit: toolkitOpt,
        callback_url: Option.getOrUndefined(callbackUrlOpt),
      });

      yield* Console.log('Auth link created successfully');
      yield* Console.log(`Session Id: ${sessionIdOpt}`);
      yield* Console.log(`Toolkit: ${toolkitOpt}`);
      yield* Console.log(
        `Connected Account Id: ${asString(response['connected_account_id']) ?? '-'}`
      );
      yield* Console.log(`Redirect URL: ${asString(response['redirect_url']) ?? '-'}`);
      yield* Console.log(`Link Token: ${asString(response['link_token']) ?? '-'}`);
    })
).pipe(
  Command.withDescription(
    'Create an authentication link for a toolkit inside an existing Tool Router session.'
  )
);

export const sessionCmd = Command.make('session').pipe(
  Command.withDescription('Manage Tool Router session workflows and account linking.'),
  Command.withSubcommands([sessionLinkCmd])
);
