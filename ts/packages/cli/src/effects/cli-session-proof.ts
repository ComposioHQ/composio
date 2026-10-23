/**
 * The proof that binds a browser login to the terminal that started it (PKCE, RFC 7636, S256):
 * the verifier stays with the CLI and goes only into the `x-cli-session-secret` header of
 * `get-session`; the challenge derived from it goes into `create-session`.
 */
import { Effect } from 'effect';
import type { PlatformError } from 'effect';
import * as Crypto from 'effect/Crypto';
import { Base64Url } from 'effect/encoding';

/** The only challenge method the API accepts. */
export const CODE_CHALLENGE_METHOD = 'S256';

export interface CliSessionProof {
  /** 32 random bytes, base64url without padding: 43 characters. Never printed or logged. */
  readonly verifier: string;
  /** base64url(SHA-256(verifier)), without padding. */
  readonly challenge: string;
}

/** A new verifier from the platform's secure random source, and its S256 challenge. */
export const makeCliSessionProof: Effect.Effect<
  CliSessionProof,
  PlatformError.PlatformError,
  Crypto.Crypto
> = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const verifier = Base64Url.encode(yield* crypto.randomBytes(32));
  const digest = yield* crypto.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: Base64Url.encode(digest) };
});
