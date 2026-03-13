import { describe, it, expect } from 'vitest';
import { AuthScheme } from '../../src/models/AuthScheme';
import { AuthSchemeTypes } from '../../src/types/authConfigs.types';
import {
  ConnectionStatuses,
  ConnectionDataSchema,
} from '../../src/types/connectedAccountAuthStates.types';

describe('AuthScheme', () => {
  describe('OAuth2', () => {
    it('should set ACTIVE status when access_token is provided', () => {
      const params = {
        access_token: 'test_token',
        token_type: 'Bearer',
      };

      const result = AuthScheme.OAuth2(params);

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.OAUTH2,
        val: {
          status: ConnectionStatuses.ACTIVE,
          access_token: 'test_token',
          token_type: 'Bearer',
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });

    it('should set ACTIVE status with all optional fields when access_token is provided', () => {
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
          status: ConnectionStatuses.ACTIVE,
          ...params,
        },
      });

      // Verify Zod schema validation
      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });

    it('should set INITIALIZING status when no access_token is provided', () => {
      const result = AuthScheme.OAuth2({});

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.OAUTH2,
        val: {
          status: ConnectionStatuses.INITIALIZING,
        },
      });

      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });

    it('should set INITIALIZING status when access_token is empty string', () => {
      const result = AuthScheme.OAuth2({ access_token: '' });

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.OAUTH2,
        val: {
          status: ConnectionStatuses.INITIALIZING,
          access_token: '',
        },
      });

      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });

    it('should honor explicit status override from user', () => {
      const result = AuthScheme.OAuth2({
        access_token: 'test_token',
        status: ConnectionStatuses.INITIALIZING,
      });

      expect(result.val.status).toBe(ConnectionStatuses.INITIALIZING);
    });
  });

  describe('OAuth1', () => {
    it('should set INITIALIZING status when only oauth_token is provided (no secret)', () => {
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

    it('should set INITIALIZING status with optional fields but no oauth_token_secret', () => {
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

    it('should set ACTIVE status when both oauth_token and oauth_token_secret are provided', () => {
      const params = {
        oauth_token: 'test_token',
        oauth_token_secret: 'test_secret',
      };

      const result = AuthScheme.OAuth1(params);

      expect(result).toEqual({
        authScheme: AuthSchemeTypes.OAUTH1,
        val: {
          status: ConnectionStatuses.ACTIVE,
          oauth_token: 'test_token',
          oauth_token_secret: 'test_secret',
        },
      });

      expect(() => ConnectionDataSchema.parse(result)).not.toThrow();
    });

    it('should set INITIALIZING status when oauth_token is empty', () => {
      const result = AuthScheme.OAuth1({
        oauth_token: '',
        oauth_token_secret: 'test_secret',
      });

      expect(result.val.status).toBe(ConnectionStatuses.INITIALIZING);
    });

    it('should honor explicit status override from user', () => {
      const result = AuthScheme.OAuth1({
        oauth_token: 'test_token',
        oauth_token_secret: 'test_secret',
        status: ConnectionStatuses.INITIALIZING,
      });

      expect(result.val.status).toBe(ConnectionStatuses.INITIALIZING);
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
      const result = AuthScheme.NoAuth({});

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
      const result = AuthScheme.CalcomAuth({});

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
