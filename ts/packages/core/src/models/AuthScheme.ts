import { AuthSchemeTypes } from '../types/authConfigs.types';
import { ConnectionData, ConnectionStatuses } from '../types/connectedAccountAuthStates.types';

export class AuthScheme {
  /**
   * Creates a ConnectionData object for OAuth2 authentication
   * @param params The OAuth2 parameters
   * @returns ConnectionData object
   */
  static OAuth2(params: {
    access_token: string;
    token_type: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    webhook_signature?: string;
    authed_user?: {
      access_token?: string;
      scope?: string;
    };
  }): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.OAUTH2,
      val: {
        status: ConnectionStatuses.INITIALIZING,
        ...params,
      },
    };
  }

  /**
   * Creates a ConnectionData object for OAuth1 authentication
   * @param params The OAuth1 parameters
   * @returns ConnectionData object
   */
  static OAuth1(params: {
    oauth_token: string;
    consumer_key?: string;
    redirectUrl?: string;
    callback_url?: string;
  }): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.OAUTH1,
      val: {
        status: ConnectionStatuses.INITIALIZING,
        ...params,
      },
    };
  }

  /**
   * Creates a ConnectionData object for Composio Link authentication
   * @returns ConnectionData object
   */
  static ComposioLink(): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.COMPOSIO_LINK,
      val: {
        status: ConnectionStatuses.INITIALIZING,
      },
    };
  }

  /**
   * Creates a ConnectionData object for API Key authentication
   * @param params The API key parameters
   * @returns ConnectionData object
   */
  static APIKey(params: { api_key: string }): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.API_KEY,
      val: {
        status: ConnectionStatuses.ACTIVE,
        api_key: params.api_key,
      },
    };
  }

  /**
   * Creates a ConnectionData object for Basic authentication
   * @param params The basic auth parameters
   * @returns ConnectionData object
   */
  static Basic(params: { username: string; password: string }): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.BASIC,
      val: {
        status: ConnectionStatuses.ACTIVE,
        username: params.username,
        password: params.password,
      },
    };
  }

  /**
   * Creates a ConnectionData object for Bearer Token authentication
   * @param params The bearer token parameters
   * @returns ConnectionData object
   */
  static BearerToken(params: { token: string }): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.BEARER_TOKEN,
      val: {
        status: ConnectionStatuses.ACTIVE,
        token: params.token,
      },
    };
  }

  /**
   * Creates a ConnectionData object for Google Service Account authentication
   * @param params The Google service account parameters
   * @returns ConnectionData object
   */
  static GoogleServiceAccount(params: { credentials_json: string }): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.GOOGLE_SERVICE_ACCOUNT,
      val: {
        status: ConnectionStatuses.ACTIVE,
        credentials_json: params.credentials_json,
      },
    };
  }

  /**
   * Creates a ConnectionData object for No Auth authentication
   * @returns ConnectionData object
   */
  static NoAuth(): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.NO_AUTH,
      val: {
        status: ConnectionStatuses.ACTIVE,
      },
    };
  }

  /**
   * Creates a ConnectionData object for Basic with JWT authentication
   * @param params The basic with JWT parameters
   * @returns ConnectionData object
   */
  static BasicWithJWT(params: { username: string; password: string }): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.BASIC_WITH_JWT,
      val: {
        status: ConnectionStatuses.ACTIVE,
        username: params.username,
        password: params.password,
      },
    };
  }

  /**
   * Creates a ConnectionData object for Cal.com authentication
   * @returns ConnectionData object
   */
  static CalcomAuth(): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.CALCOM_AUTH,
      val: {
        status: ConnectionStatuses.ACTIVE,
      },
    };
  }

  /**
   * Creates a ConnectionData object for Snowflake authentication
   * @returns ConnectionData object
   */
  static Snowflake(): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.SNOWFLAKE,
      val: {
        status: ConnectionStatuses.ACTIVE,
      },
    };
  }

  /**
   * Creates a ConnectionData object for Bill.com authentication
   * @param params The Bill.com auth parameters
   * @returns ConnectionData object
   */
  static BillcomAuth(params: { sessionId: string; devKey: string }): ConnectionData {
    return {
      authScheme: AuthSchemeTypes.BILLCOM_AUTH,
      val: {
        status: ConnectionStatuses.ACTIVE,
        sessionId: params.sessionId,
        devKey: params.devKey,
      },
    };
  }
}
