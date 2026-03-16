import { AuthSchemeTypes } from '../types/authConfigs.types';
import {
  BaseConnectionFields,
  ConnectionData,
  ConnectionStatuses,
} from '../types/connectedAccountAuthStates.types';

export class AuthScheme {
  /**
   * Creates a ConnectionData object for OAuth2 authentication.
   * When `access_token` is provided, status defaults to ACTIVE (token import).
   * When omitted, status defaults to INITIALIZING (redirect-based OAuth flow).
   * Pass an explicit `status` in params to override the auto-detected default.
   * @param params The OAuth2 parameters
   * @returns ConnectionData object
   */
  static OAuth2(
    params: BaseConnectionFields & {
      access_token?: string;
      token_type?: string;
      id_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      webhook_signature?: string;
      authed_user?: {
        access_token?: string;
        scope?: string;
      };
      code_verifier?: string;
      redirectUrl?: string;
      callback_url?: string;
      finalRedirectUri?: string;
      error?: string;
      error_description?: string;
      expired_at?: string;
    }
  ): ConnectionData {
    const hasToken = !!params.access_token;
    return {
      authScheme: AuthSchemeTypes.OAUTH2,
      val: {
        status: hasToken ? ConnectionStatuses.ACTIVE : ConnectionStatuses.INITIALIZING,
        ...params,
      },
    } as ConnectionData;
  }

  /**
   * Creates a ConnectionData object for OAuth1 authentication.
   * When both `oauth_token` and `oauth_token_secret` are provided, status defaults to ACTIVE (token import).
   * When either is omitted, status defaults to INITIALIZING (redirect-based OAuth flow).
   * Pass an explicit `status` in params to override the auto-detected default.
   * @param params The OAuth1 parameters
   * @returns ConnectionData object
   */
  static OAuth1(
    params: BaseConnectionFields & {
      oauth_token?: string;
      oauth_token_secret?: string;
      consumer_key?: string;
      redirectUrl?: string;
      callback_url?: string;
      error?: string;
      error_description?: string;
      expired_at?: string;
    }
  ): ConnectionData {
    const hasTokens = !!params.oauth_token && !!params.oauth_token_secret;
    return {
      authScheme: AuthSchemeTypes.OAUTH1,
      val: {
        status: hasTokens ? ConnectionStatuses.ACTIVE : ConnectionStatuses.INITIALIZING,
        ...params,
      },
    } as ConnectionData;
  }

  /**
   * Creates a ConnectionData object for API Key authentication
   * @param params The API key parameters
   * @returns ConnectionData object
   */
  static APIKey(
    params: BaseConnectionFields & { api_key?: string; generic_api_key?: string }
  ): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.API_KEY,
      val: {
        status: ConnectionStatuses.ACTIVE,
        ...params,
      },
    };
  }

  /**
   * Creates a ConnectionData object for Basic authentication
   * @param params The basic auth parameters
   * @returns ConnectionData object
   */
  static Basic(
    params: BaseConnectionFields & { username: string; password: string }
  ): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.BASIC,
      val: {
        status: ConnectionStatuses.ACTIVE,
        ...params,
      },
    };
  }

  /**
   * Creates a ConnectionData object for Bearer Token authentication
   * @param params The bearer token parameters
   * @returns ConnectionData object
   */
  static BearerToken(params: BaseConnectionFields & { token: string }): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.BEARER_TOKEN,
      val: {
        status: ConnectionStatuses.ACTIVE,
        ...params,
      },
    };
  }

  /**
   * Creates a ConnectionData object for Google Service Account authentication
   * @param params The Google service account parameters
   * @returns ConnectionData object
   */
  static GoogleServiceAccount(
    params: BaseConnectionFields & { credentials_json: string }
  ): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.GOOGLE_SERVICE_ACCOUNT,
      val: {
        status: ConnectionStatuses.ACTIVE,
        ...params,
      },
    };
  }

  /**
   * Creates a ConnectionData object for No Auth authentication
   * @returns ConnectionData object
   */
  static NoAuth(params?: BaseConnectionFields): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.NO_AUTH,
      val: {
        status: ConnectionStatuses.ACTIVE,
        ...(params ?? {}),
      },
    };
  }

  /**
   * Creates a ConnectionData object for Basic with JWT authentication
   * @param params The basic with JWT parameters
   * @returns ConnectionData object
   */
  static BasicWithJWT(
    params: BaseConnectionFields & { username: string; password: string }
  ): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.BASIC_WITH_JWT,
      val: {
        status: ConnectionStatuses.ACTIVE,
        ...params,
      },
    };
  }

  /**
   * Creates a ConnectionData object for Cal.com authentication
   * @returns ConnectionData object
   */
  static CalcomAuth(params?: BaseConnectionFields): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.CALCOM_AUTH,
      val: {
        status: ConnectionStatuses.ACTIVE,
        ...(params ?? {}),
      },
    };
  }

  /**
   * Creates a ConnectionData object for Bill.com authentication
   * @param params The Bill.com auth parameters
   * @returns ConnectionData object
   */
  static BillcomAuth(
    params: BaseConnectionFields & { sessionId: string; devKey: string }
  ): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.BILLCOM_AUTH,
      val: {
        status: ConnectionStatuses.ACTIVE,
        ...params,
      },
    };
  }
}
