import { requestError } from 'src/effects/request-error';

export class ConnectionsRemovalRequestError extends requestError(
  'commands/ConnectionsRemovalRequestError'
) {}
