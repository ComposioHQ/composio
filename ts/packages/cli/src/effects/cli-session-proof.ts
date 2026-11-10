/**
 * The proof that binds a browser login to the terminal that started it (PKCE, RFC 7636, S256):
 * the verifier stays with the CLI and goes only into the `x-cli-session-secret` header of
 * `get-session`; the challenge derived from it goes into `create-session`.
 */
import { Effect } from 'effect';
import { Digest, SecureRandom } from 'effect/crypto';
import { Base64Url } from 'effect/encoding';

/** The only challenge method the API accepts. */
export const CODE_CHALLENGE_METHOD = 'S256';

export interface CliSessionProof {
  readonly verifier: string;
  readonly challenge: string;
}

export const makeCliSessionProof: Effect.Effect<
  CliSessionProof,
  never,
  SecureRandom.SecureRandom | Digest.Digest
> = Effect.gen(function* () {
  const random = yield* SecureRandom.SecureRandom;
  const digestService = yield* Digest.Digest;
  const verifier = Base64Url.encode(yield* random.randomBytes(32));
  const digest = yield* digestService.digest(Digest.sha256, new TextEncoder().encode(verifier));
  return { verifier, challenge: Base64Url.encode(digest) };
});
