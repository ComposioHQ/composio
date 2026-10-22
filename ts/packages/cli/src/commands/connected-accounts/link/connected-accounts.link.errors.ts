import { Data } from 'effect';
import { ExpectedFailure } from 'src/effects/expected-failure';
import { requestError } from 'src/effects/request-error';

export class ConnectionPollingError extends Data.TaggedError('commands/ConnectionPollingError')<{
  readonly message: string;
  readonly connectedAccountId: string;
  readonly status: string;
}> {
  get [ExpectedFailure]() {
    return true;
  }
}

export class MissingLinkUserIdError extends Data.TaggedError('commands/MissingLinkUserIdError')<{
  readonly message: string;
  readonly flow: 'list' | 'legacy' | 'tool-router';
}> {
  get [ExpectedFailure]() {
    return true;
  }
}

export class ConnectedAccountsDecodeError extends Data.TaggedError(
  'commands/ConnectedAccountsDecodeError'
)<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class ConnectedAccountsRequestError extends requestError(
  'commands/ConnectedAccountsRequestError'
) {}

export class BrowserOpenError extends Data.TaggedError('commands/BrowserOpenError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}
