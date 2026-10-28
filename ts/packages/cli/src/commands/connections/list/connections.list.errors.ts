import { requestError } from 'src/effects/request-error';

export class ConnectionsListRequestError extends requestError(
  'commands/ConnectionsListRequestError'
) {}
