import { describe, it, expect } from 'vitest';
import {
  ConnectionDataSchema,
  ConnectionStatuses,
  Oauth2RevokedConnectionDataSchema,
} from '../../src/types/connectedAccountAuthStates.types';
import { transformConnectedAccountResponse } from '../../src/utils/transformers/connectedAccounts';
import { AuthSchemeTypes } from '../../src/types/authConfigs.types';

describe('connectedAccountAuthStates — REVOKED arms', () => {
  describe('Oauth2RevokedConnectionDataSchema', () => {
    it('parses a payload with only the status discriminator', () => {
      const parsed = Oauth2RevokedConnectionDataSchema.parse({
        status: ConnectionStatuses.REVOKED,
      });

      expect(parsed.status).toBe(ConnectionStatuses.REVOKED);
      expect(parsed.revoked_at).toBeUndefined();
    });

    it('parses a payload with optional revoked_at', () => {
      const parsed = Oauth2RevokedConnectionDataSchema.parse({
        status: ConnectionStatuses.REVOKED,
        revoked_at: '2026-05-01T12:34:56Z',
      });

      expect(parsed.revoked_at).toBe('2026-05-01T12:34:56Z');
    });

    it('rejects when status is not REVOKED', () => {
      expect(() =>
        Oauth2RevokedConnectionDataSchema.parse({
          status: ConnectionStatuses.ACTIVE,
        })
      ).toThrow();
    });
  });

  describe('ConnectionDataSchema discriminated union', () => {
    it('accepts REVOKED for OAUTH2 and preserves auth-scheme metadata', () => {
      const parsed = ConnectionDataSchema.parse({
        authScheme: AuthSchemeTypes.OAUTH2,
        val: {
          status: ConnectionStatuses.REVOKED,
          revoked_at: '2026-05-01T00:00:00Z',
        },
      });

      expect(parsed.authScheme).toBe(AuthSchemeTypes.OAUTH2);
      expect(parsed.val.status).toBe(ConnectionStatuses.REVOKED);
    });

    it('accepts REVOKED for S2S_OAUTH2 (preempts the queued Apollo rollout)', () => {
      const parsed = ConnectionDataSchema.parse({
        authScheme: AuthSchemeTypes.S2S_OAUTH2,
        val: {
          status: ConnectionStatuses.REVOKED,
          revoked_at: '2026-05-01T00:00:00Z',
        },
      });

      expect(parsed.authScheme).toBe(AuthSchemeTypes.S2S_OAUTH2);
      expect(parsed.val.status).toBe(ConnectionStatuses.REVOKED);
    });
  });

  describe('transformConnectedAccountResponse — REVOKED preserves state', () => {
    const baseResponse = {
      id: 'conn_123',
      auth_config: {
        id: 'auth_123',
        auth_scheme: 'OAUTH2',
        is_composio_managed: true,
        is_disabled: false,
      },
      user_id: 'user_123',
      data: {},
      params: {},
      is_disabled: false,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
      status_reason: 'token revoked at provider',
      toolkit: { slug: 'gmail' },
      test_request_endpoint: '',
    } as const;

    it('does not drop state for an OAUTH2 REVOKED payload', () => {
      const transformed = transformConnectedAccountResponse({
        ...baseResponse,
        status: ConnectionStatuses.REVOKED,
        state: {
          authScheme: AuthSchemeTypes.OAUTH2,
          val: {
            status: ConnectionStatuses.REVOKED,
            revoked_at: '2026-05-01T00:00:00Z',
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      expect(transformed.status).toBe(ConnectionStatuses.REVOKED);
      expect(transformed.state).toBeDefined();
      expect(transformed.state?.authScheme).toBe(AuthSchemeTypes.OAUTH2);
      expect(transformed.state?.val.status).toBe(ConnectionStatuses.REVOKED);
    });

    it('does not drop state for an S2S_OAUTH2 REVOKED payload', () => {
      const transformed = transformConnectedAccountResponse({
        ...baseResponse,
        auth_config: { ...baseResponse.auth_config, auth_scheme: 'S2S_OAUTH2' },
        status: ConnectionStatuses.REVOKED,
        state: {
          authScheme: AuthSchemeTypes.S2S_OAUTH2,
          val: {
            status: ConnectionStatuses.REVOKED,
            revoked_at: '2026-05-01T00:00:00Z',
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      expect(transformed.state).toBeDefined();
      expect(transformed.state?.authScheme).toBe(AuthSchemeTypes.S2S_OAUTH2);
    });
  });

  describe('ConnectionStatuses enum closure', () => {
    // Forces deliberate updates when Apollo adds a status.
    it('enumerates exactly the values this PR contracts for', () => {
      expect(new Set(Object.values(ConnectionStatuses))).toEqual(
        new Set(['INITIALIZING', 'INITIATED', 'ACTIVE', 'FAILED', 'EXPIRED', 'INACTIVE', 'REVOKED'])
      );
    });
  });
});
