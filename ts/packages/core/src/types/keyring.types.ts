import { z } from 'zod/v3';

/**
 * A public JWK a secret can be sealed to. Fields keep their JWK names so a
 * key can be handed straight to WebCrypto or a JOSE library.
 */
export const KeyringTransferKeySchema = z.object({
  /** Key type. Always `RSA`. */
  kty: z.string(),
  /** RSA modulus, base64url-encoded. */
  n: z.string(),
  /** RSA public exponent, base64url-encoded. */
  e: z.string(),
  /** Key-management algorithm for the JWE (`RSA-OAEP-256`). Pair it with `A256GCM` content encryption. */
  alg: z.string(),
  /** Key use. Always `enc`. */
  use: z.string(),
  /** Key identifier. Put it in the JWE protected header. */
  kid: z.string(),
});
export type KeyringTransferKey = z.infer<typeof KeyringTransferKeySchema>;

/**
 * Response of `composio.keyring.listTransferKeys()`.
 */
export const KeyringTransferKeysResponseSchema = z.object({
  /** The `kid` of the key to seal new secrets to. */
  activeKid: z.string(),
  /** Every currently accepted transfer key, newest first. */
  keys: z.array(KeyringTransferKeySchema),
});
export type KeyringTransferKeysResponse = z.infer<typeof KeyringTransferKeysResponseSchema>;
