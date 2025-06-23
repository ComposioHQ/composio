import {
  ConnectedAccountRetrieveResponse,
  ConnectedAccountStatus,
} from './connectedAccounts.types';

export interface ConnectionRequestState {
  id: string;
  status?: ConnectedAccountStatus;
  redirectUrl?: string | null;
}

export interface ConnectionRequest extends ConnectionRequestState {
  waitForConnection: (timeout?: number) => Promise<ConnectedAccountRetrieveResponse>;
  toJSON: () => ConnectionRequestState;
  toString: () => string;
}
