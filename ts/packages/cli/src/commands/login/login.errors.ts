import { Data } from 'effect';
import { ExpectedFailure } from 'src/effects/expected-failure';
import { requestError } from 'src/effects/request-error';

/** `--org` names no organization the user API key can see. */
export class InvalidOrganizationError extends Data.TaggedError(
  'commands/InvalidOrganizationError'
)<{
  readonly message: string;
  readonly requestedOrg: string;
}> {
  get [ExpectedFailure]() {
    return true;
  }
}

/**
 * Looking up the CLI session behind `--key` failed for a reason other than the session not
 * existing (a connection, server, or decoding failure). A defect, reported with its cause.
 */
export class LoginSessionRequestError extends requestError('commands/LoginSessionRequestError') {}
