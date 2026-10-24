import { Data } from 'effect';
import { requestError } from 'src/effects/request-error';

export class MissingConnectionRemovalConsumerUserIdError extends Data.TaggedError(
  'commands/MissingConnectionRemovalConsumerUserIdError'
)<{
  readonly message: string;
}> {}

export class ConnectionsRemovalRequestError extends requestError(
  'commands/ConnectionsRemovalRequestError'
) {}
