/**
 * @fileoverview The `composio.keyring` namespace: the public transfer keys of
 * the organization's customer-managed keyring.
 *
 * @module Keyring
 */
import ComposioClient from '@composio/client';
import { KeyringTransferKeysResponse } from '../types/keyring.types';
import { ComposioRequestOptions } from '../types/requestOptions.types';
import { telemetry } from '../telemetry/Telemetry';
import { withCancellation } from '../utils/cancellation';
import { transformKeyringTransferKeysResponse } from '../utils/transformers/keyring';

/**
 * `composio.keyring` — the organization's customer-managed keyring.
 *
 * @example
 * ```typescript
 * const { activeKid, keys } = await composio.keyring.listTransferKeys();
 * const sealingKey = keys.find(key => key.kid === activeKid);
 * ```
 */
export class Keyring {
  private client: ComposioClient;

  constructor(client: ComposioClient) {
    this.client = client;
    telemetry.instrument(this, 'Keyring');
  }

  /**
   * Lists the public transfer keys of the organization's active customer
   * keyring, the keys a secret is sealed to before it is sent to Composio.
   *
   * Always seal new secrets to the key whose `kid` is `activeKid`: a JWE with
   * `RSA-OAEP-256` key management, `A256GCM` content encryption, and the
   * `kid` in the protected header. Older keys stay listed so values sealed to
   * them remain openable.
   *
   * The organization behind the API key must have an ACTIVE customer keyring
   * instance; otherwise the API answers 404.
   *
   * @returns {Promise<KeyringTransferKeysResponse>} The active key ID and every accepted public JWK, newest first
   *
   * @example
   * ```typescript
   * import { CompactEncrypt, importJWK } from 'jose';
   *
   * const { activeKid, keys } = await composio.keyring.listTransferKeys();
   * const jwk = keys.find(key => key.kid === activeKid)!;
   * const sealed = await new CompactEncrypt(new TextEncoder().encode(secret))
   *   .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid: activeKid })
   *   .encrypt(await importJWK(jwk, 'RSA-OAEP-256'));
   * ```
   */
  async listTransferKeys(
    requestOptions?: ComposioRequestOptions
  ): Promise<KeyringTransferKeysResponse> {
    const result = await withCancellation(
      () => this.client.keyring.listTransferKeys(requestOptions),
      requestOptions?.signal
    );
    return transformKeyringTransferKeysResponse(result);
  }
}
