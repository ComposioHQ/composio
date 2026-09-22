import type { KeyringListTransferKeysResponse as RawKeyringListTransferKeysResponse } from '@composio/client/resources/keyring';
import {
  KeyringTransferKeysResponse,
  KeyringTransferKeysResponseSchema,
} from '../../types/keyring.types';
import { transform } from '../transform';

export const transformKeyringTransferKeysResponse = (
  response: RawKeyringListTransferKeysResponse
): KeyringTransferKeysResponse => {
  return transform(response)
    .with(KeyringTransferKeysResponseSchema)
    .using(response => ({
      activeKid: response.active_kid,
      keys: response.keys.map(key => ({
        kty: key.kty,
        n: key.n,
        e: key.e,
        alg: key.alg,
        use: key.use,
        kid: key.kid,
      })),
    }));
};
