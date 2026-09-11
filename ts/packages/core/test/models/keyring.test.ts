import { describe, it, expect, vi, beforeEach } from 'vitest';
import ComposioClient from '@composio/client';
import { Keyring } from '../../src/models/Keyring';
import { telemetry } from '../../src/telemetry/Telemetry';

vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: {
    instrument: vi.fn(),
  },
}));

const createMockClient = () => ({
  keyring: {
    listTransferKeys: vi.fn(),
  },
});

const rawKey = {
  kty: 'RSA',
  n: 'sXch3m2k0Yg',
  e: 'AQAB',
  alg: 'RSA-OAEP-256',
  use: 'enc',
  kid: 'kid_2',
};

describe('Keyring', () => {
  let keyring: Keyring;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    keyring = new Keyring(mockClient as unknown as ComposioClient);
  });

  it('instruments itself', () => {
    expect(telemetry.instrument).toHaveBeenCalledWith(keyring, 'Keyring');
  });

  it('returns the active kid and keeps the JWK field names', async () => {
    mockClient.keyring.listTransferKeys.mockResolvedValue({
      success: true,
      active_kid: 'kid_2',
      keys: [rawKey, { ...rawKey, kid: 'kid_1' }],
    });

    const result = await keyring.listTransferKeys();

    expect(mockClient.keyring.listTransferKeys).toHaveBeenCalledWith(undefined);
    expect(result).toEqual({
      activeKid: 'kid_2',
      keys: [rawKey, { ...rawKey, kid: 'kid_1' }],
    });
  });

  it('forwards request options', async () => {
    mockClient.keyring.listTransferKeys.mockResolvedValue({
      success: true,
      active_kid: 'kid_2',
      keys: [rawKey],
    });
    const signal = new AbortController().signal;

    await keyring.listTransferKeys({ signal });

    expect(mockClient.keyring.listTransferKeys).toHaveBeenCalledWith({ signal });
  });
});
