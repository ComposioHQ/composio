import { Data } from 'effect';
import { ExpectedFailure } from 'src/effects/expected-failure';

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
