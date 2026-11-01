import { requestError } from 'src/effects/request-error';

export class ConnectedAccountsListRequestError extends requestError(
  'commands/ConnectedAccountsListRequestError'
) {}
