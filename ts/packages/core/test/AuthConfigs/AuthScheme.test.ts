import { describe, it, expect } from 'vitest';
import { AuthScheme } from '../../src/models/AuthScheme';
import { AuthSchemeTypes } from '../../src/types/authConfigs.types';
import {
  ConnectionStatuses,
  ConnectionDataSchema,
} from '../../src/types/connectedAccountAuthStates.types';

describe('AuthScheme', () => {
  describe('OAuth2', () => {
    it('should create OAuth2 connection data with required fields', () => {
      const params = {
        access_token: 'test_token',
        token_type: 'Bearer',
      };

      const result = AuthScheme.OAuth2(params);

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.OAUTH2,
        val: {
          status: ConnectionStatuses.INITIALIZING,
          access_token: 'test_token',
          token_type: 'Bearer',
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });

    it('should create OAuth2 connection data with all optional fields', () => {
      const params = {
        access_token: 'test_token',
        token_type: 'Bearer',
        id_token: 'id_token',
        refresh_token: 'refresh_token',
        expires_in: 3600,
        scope: 'read write',
        webhook_signature: 'signature',
        authed_user: {
          access_token: 'user_token',
          scope: 'user_scope',
        },
      };

      const result = AuthScheme.OAuth2(params);

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.OAUTH2,
        val: {
          status: ConnectionStatuses.INITIALIZING,
          ...params,
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });
  });

  describe('OAuth1', () => {
    it('should create OAuth1 connection data with required fields', () => {
      const params = {
        oauth_token: 'test_token',
      };

      const result = AuthScheme.OAuth1(params);

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.OAUTH1,
        val: {
          status: ConnectionStatuses.INITIALIZING,
          oauth_token: 'test_token',
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });

    it('should create OAuth1 connection data with all optional fields', () => {
      const params = {
        oauth_token: 'test_token',
        consumer_key: 'consumer_key',
        redirectUrl: 'http://example.com/callback',
        callback_url: 'http://example.com/callback',
      };

      const result = AuthScheme.OAuth1(params);

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.OAUTH1,
        val: {
          status: ConnectionStatuses.INITIALIZING,
          ...params,
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });
  });

  describe('ComposioLink', () => {
    it('should create ComposioLink connection data', () => {
      const result = AuthScheme.ComposioLink();

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.COMPOSIO_LINK,
        val: {
          status: ConnectionStatuses.INITIALIZING,
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });
  });

  describe('APIKey', () => {
    it('should create APIKey connection data', () => {
      const params = {
        api_key: 'test_api_key',
      };

      const result = AuthScheme.APIKey(params);

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.API_KEY,
        val: {
          status: ConnectionStatuses.ACTIVE,
          api_key: 'test_api_key',
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });
  });

  describe('Basic', () => {
    it('should create Basic connection data', () => {
      const params = {
        username: 'test_user',
        password: 'test_pass',
      };

      const result = AuthScheme.Basic(params);

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.BASIC,
        val: {
          status: ConnectionStatuses.ACTIVE,
          username: 'test_user',
          password: 'test_pass',
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });
  });

  describe('BearerToken', () => {
    it('should create BearerToken connection data', () => {
      const params = {
        token: 'test_token',
      };

      const result = AuthScheme.BearerToken(params);

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.BEARER_TOKEN,
        val: {
          status: ConnectionStatuses.ACTIVE,
          token: 'test_token',
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });
  });

  describe('GoogleServiceAccount', () => {
    it('should create GoogleServiceAccount connection data', () => {
      const params = {
        credentials_json: '{"key": "value"}',
      };

      const result = AuthScheme.GoogleServiceAccount(params);

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.GOOGLE_SERVICE_ACCOUNT,
        val: {
          status: ConnectionStatuses.ACTIVE,
          credentials_json: '{"key": "value"}',
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });
  });

  describe('NoAuth', () => {
    it('should create NoAuth connection data', () => {
      const result = AuthScheme.NoAuth();

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.NO_AUTH,
        val: {
          status: ConnectionStatuses.ACTIVE,
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });
  });

  describe('BasicWithJWT', () => {
    it('should create BasicWithJWT connection data', () => {
      const params = {
        username: 'test_user',
        password: 'test_pass',
      };

      const result = AuthScheme.BasicWithJWT(params);

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.BASIC_WITH_JWT,
        val: {
          status: ConnectionStatuses.ACTIVE,
          username: 'test_user',
          password: 'test_pass',
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });
  });

  describe('CalcomAuth', () => {
    it('should create CalcomAuth connection data', () => {
      const result = AuthScheme.CalcomAuth();

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.CALCOM_AUTH,
        val: {
          status: ConnectionStatuses.ACTIVE,
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });
  });

  describe('BillcomAuth', () => {
    it('should create BillcomAuth connection data', () => {
      const params = {
        sessionId: 'test_session',
        devKey: 'test_key',
      };

      const result = AuthScheme.BillcomAuth(params);

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.BILLCOM_AUTH,
        val: {
          status: ConnectionStatuses.ACTIVE,
          sessionId: 'test_session',
          devKey: 'test_key',
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });
  });
});
