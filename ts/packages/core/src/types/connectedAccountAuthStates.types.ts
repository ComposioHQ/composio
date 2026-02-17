import { z } from 'zod/v3';
import { AuthSchemeTypes } from './authConfigs.types';

export const ConnectionStatuses = {
  INITIALIZING: 'INITIALIZING',
  INITIATED: 'INITIATED',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  INACTIVE: 'INACTIVE',
} as const;
export type ConnectionStatusEnum = (typeof ConnectionStatuses)[keyof typeof ConnectionStatuses];

export const RedirectableAuthSchemeSchema = z.enum([
  AuthSchemeTypes.OAUTH1,
  AuthSchemeTypes.OAUTH2,
]);

// Define base fields as a Zod object (no baseUrl)
const BaseSchemeRaw = z
  .object({
    // for posthog, freshdesk, zendesk, clickup and others
    subdomain: z.string().optional(),
    // for atlassian
    ['your-domain']: z.string().optional(),
    // for mixpanel
    region: z.string().optional(),
    // for shopify
    shop: z.string().optional(),
    // for snowflake
    account_url: z.string().optional(),
    // likely pipedrive
    COMPANYDOMAIN: z.string().optional(),
    // likely zoho
    extension: z.string().optional(),
    // likely formsite
    form_api_base_url: z.string().optional(),
    // likely salesforce
    instanceEndpoint: z.string().optional(),
    // likely active campaign
    api_url: z.string().optional(),
    // for borneo
    borneo_dashboard_url: z.string().optional(),
    // for zenrows proxy
    proxy_username: z.string().optional(),
    proxy_password: z.string().optional(),
    // for d2l
    domain: z.string().optional(),
    version: z.string().optional(),
    // for mailchimp
    dc: z.string().optional(),
    // for sharepoint
    site_name: z.string().optional(),
    // for servicenow
    instanceName: z.string().optional(),
    // for netsuite
    account_id: z.string().optional(),
    // for custom servers
    your_server: z.string().optional(),
    // for ragic
    server_location: z.string().optional(),
    // base_url only
    base_url: z.string().optional(),
    // for api key
    api_key: z.string().optional(),
    // for generic api key
    generic_api_key: z.string().optional(),
    // for bearer token
    bearer_token: z.string().optional(),
    // for basic auth encoded
    basic_encoded: z.string().optional(),
    // for dcr oauth
    long_redirect_url: z.boolean().optional(),
    state_prefix: z.string().optional(),
    registration_access_token: z.string().optional(),
    registration_client_uri: z.string().optional(),
    // for google service account initiated status
    composio_link_redirect_url: z.string().optional(),
  })
  .catchall(z.unknown());

export type BaseConnectionFields = z.infer<typeof BaseSchemeRaw>;

// OAUTH2
export const Oauth2InitiatingConnectionDataSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());

export const Oauth2InitiatedConnectionDataSchema = Oauth2InitiatingConnectionDataSchema.extend({
  status: z.literal(ConnectionStatuses.INITIATED),
  code_verifier: z.string().optional(),
  redirectUrl: z.string(),
  callback_url: z.string().optional(),
  finalRedirectUri: z.string().optional(),
  // previously verification_token, will be sent as verification_token to slack
  webhook_signature: z.string().optional(),
}).catchall(z.unknown());

export const Oauth2ActiveConnectionDataSchema = Oauth2InitiatingConnectionDataSchema.extend({
  status: z.literal(ConnectionStatuses.ACTIVE),
  access_token: z.string(),
  id_token: z.string().optional(),
  token_type: z.string().optional(),
  refresh_token: z.string().nullish(),
  expires_in: z.union([z.string(), z.number(), z.null()]).optional(),
  scope: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
  // previously verification_token, will be sent as verification_token to slack
  webhook_signature: z.string().optional(),
  authed_user: z
    .object({
      access_token: z.string().optional(),
      scope: z.string().optional(),
    })
    .optional()
    .describe('for slack user scopes'),
}).catchall(z.unknown());

export const Oauth2FailedConnectionDataSchema = Oauth2InitiatingConnectionDataSchema.extend({
  status: z.literal(ConnectionStatuses.FAILED),
  error: z.string().optional(),
  error_description: z.string().optional(),
}).catchall(z.unknown());

export const Oauth2ExpiredConnectionDataSchema = Oauth2InitiatingConnectionDataSchema.extend({
  status: z.literal(ConnectionStatuses.EXPIRED),
  expired_at: z.string().optional(),
}).catchall(z.unknown());

export const Oauth2InactiveConnectionDataSchema = Oauth2InitiatingConnectionDataSchema.extend({
  status: z.literal(ConnectionStatuses.INACTIVE),
  access_token: z.string(),
  id_token: z.string().optional(),
  token_type: z.string().optional(),
  refresh_token: z.string().nullish(),
  expires_in: z.union([z.string(), z.number(), z.null()]).optional(),
  scope: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
  webhook_signature: z.string().optional(),
  authed_user: z
    .object({
      access_token: z.string().optional(),
      scope: z.string().optional(),
    })
    .optional()
    .describe('for slack user scopes'),
}).catchall(z.unknown());

export const Oauth2ConnectionDataSchema = z.discriminatedUnion('status', [
  Oauth2InitiatingConnectionDataSchema,
  Oauth2InitiatedConnectionDataSchema,
  Oauth2ActiveConnectionDataSchema,
  Oauth2FailedConnectionDataSchema,
  Oauth2ExpiredConnectionDataSchema,
  Oauth2InactiveConnectionDataSchema,
]);

export const CustomOauth2ConnectionDataSchema = Oauth2ActiveConnectionDataSchema.omit({
  status: true,
});

export type Oauth2InitiatingConnectionData = z.infer<typeof Oauth2InitiatingConnectionDataSchema>;
export type Oauth2InitiatedConnectionData = z.infer<typeof Oauth2InitiatedConnectionDataSchema>;
export type Oauth2ActiveConnectionData = z.infer<typeof Oauth2ActiveConnectionDataSchema>;
export type Oauth2FailedConnectionData = z.infer<typeof Oauth2FailedConnectionDataSchema>;
export type Oauth2ExpiredConnectionData = z.infer<typeof Oauth2ExpiredConnectionDataSchema>;
export type Oauth2InactiveConnectionData = z.infer<typeof Oauth2InactiveConnectionDataSchema>;
export type Oauth2ConnectionData = z.infer<typeof Oauth2ConnectionDataSchema>;
export type CustomOauth2ConnectionData = z.infer<typeof CustomOauth2ConnectionDataSchema>;

// OAUTH1
export const Oauth1InitiatingConnectionDataSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());

export const Oauth1InitiatedConnectionDataSchema = Oauth1InitiatingConnectionDataSchema.extend({
  status: z.literal(ConnectionStatuses.INITIATED),
  authUri: z.string(),
  oauth_token: z.string(),
  oauth_token_secret: z.string(),
  redirectUrl: z.string(),
  callbackUrl: z.string().optional(),
}).catchall(z.unknown());

export const Oauth1ActiveConnectionDataSchema = Oauth1InitiatingConnectionDataSchema.extend({
  status: z.literal(ConnectionStatuses.ACTIVE),
  oauth_token: z.string(),
  oauth_token_secret: z.string(),
  consumer_key: z.string().optional(),
  oauth_verifier: z.string().optional(),
  redirectUrl: z.string().optional(),
  callback_url: z.string().optional(),
}).catchall(z.unknown());

export const Oauth1FailedConnectionDataSchema = Oauth1InitiatingConnectionDataSchema.extend({
  status: z.literal(ConnectionStatuses.FAILED),
  error: z.string().optional(),
  error_description: z.string().optional(),
}).catchall(z.unknown());

export const Oauth1ExpiredConnectionDataSchema = Oauth1InitiatingConnectionDataSchema.extend({
  status: z.literal(ConnectionStatuses.EXPIRED),
  expired_at: z.string().optional(),
}).catchall(z.unknown());

export const Oauth1InactiveConnectionDataSchema = Oauth1InitiatingConnectionDataSchema.extend({
  status: z.literal(ConnectionStatuses.INACTIVE),
  oauth_token: z.string(),
  oauth_token_secret: z.string(),
  consumer_key: z.string().optional(),
  oauth_verifier: z.string().optional(),
  redirectUrl: z.string().optional(),
  callback_url: z.string().optional(),
}).catchall(z.unknown());

export const Oauth1ConnectionDataSchema = z.discriminatedUnion('status', [
  Oauth1InitiatingConnectionDataSchema,
  Oauth1InitiatedConnectionDataSchema,
  Oauth1ActiveConnectionDataSchema,
  Oauth1FailedConnectionDataSchema,
  Oauth1ExpiredConnectionDataSchema,
  Oauth1InactiveConnectionDataSchema,
]);

export const CustomOauth1ConnectionDataSchema = Oauth1ActiveConnectionDataSchema.omit({
  status: true,
});

export type Oauth1InitiatingConnectionData = z.infer<typeof Oauth1InitiatingConnectionDataSchema>;
export type Oauth1InitiatedConnectionData = z.infer<typeof Oauth1InitiatedConnectionDataSchema>;
export type Oauth1ActiveConnectionData = z.infer<typeof Oauth1ActiveConnectionDataSchema>;
export type Oauth1FailedConnectionData = z.infer<typeof Oauth1FailedConnectionDataSchema>;
export type Oauth1ExpiredConnectionData = z.infer<typeof Oauth1ExpiredConnectionDataSchema>;
export type Oauth1InactiveConnectionData = z.infer<typeof Oauth1InactiveConnectionDataSchema>;
export type Oauth1ConnectionData = z.infer<typeof Oauth1ConnectionDataSchema>;
export type CustomOauth1ConnectionData = z.infer<typeof CustomOauth1ConnectionDataSchema>;

// BILLCOM_AUTH
const BillcomAuthInitiatingSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());
export const BillcomAuthConnectionDataSchema = z.discriminatedUnion('status', [
  BillcomAuthInitiatingSchema,
  BillcomAuthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.INITIATED),
    redirectUrl: z.string(),
  }).catchall(z.unknown()),
  BillcomAuthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.ACTIVE),
    sessionId: z.string(),
    devKey: z.string(),
  }).catchall(z.unknown()),
  BillcomAuthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  BillcomAuthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
  BillcomAuthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.INACTIVE),
  }).catchall(z.unknown()),
]);

// BASIC
const BasicBaseSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());
const BasicConnectionDataSchema = z.discriminatedUnion('status', [
  BasicBaseSchema,
  BasicBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INITIATED),
  }).catchall(z.unknown()),
  BasicBaseSchema.extend({
    status: z.literal(ConnectionStatuses.ACTIVE),
    username: z.string(),
    password: z.string(),
  }).catchall(z.unknown()),
  BasicBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INACTIVE),
    username: z.string(),
    password: z.string(),
  }).catchall(z.unknown()),
  BasicBaseSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    username: z.string(),
    password: z.string(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  BasicBaseSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    username: z.string(),
    password: z.string(),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);
const CustomBasicConnectionDataSchema = BaseSchemeRaw.extend({
  username: z.string(),
  password: z.string(),
}).catchall(z.unknown());

// API_KEY
const ApiKeyBaseSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());
const ApiKeyConnectionDataSchema = z.discriminatedUnion('status', [
  ApiKeyBaseSchema,
  ApiKeyBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INITIATED),
  }).catchall(z.unknown()),
  ApiKeyBaseSchema.extend({
    status: z.literal(ConnectionStatuses.ACTIVE),
    api_key: z.string().optional(),
    generic_api_key: z.string().optional(),
  }).catchall(z.unknown()),
  ApiKeyBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INACTIVE),
    api_key: z.string().optional(),
    generic_api_key: z.string().optional(),
  }).catchall(z.unknown()),
  ApiKeyBaseSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  ApiKeyBaseSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);
const CustomApiKeyConnectionDataSchema = BaseSchemeRaw.extend({
  api_key: z.string().optional(),
  generic_api_key: z.string().optional(),
}).catchall(z.unknown());

// BEARER_TOKEN
const BearerTokenBaseSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());
const BearerTokenConnectionDataSchema = z.discriminatedUnion('status', [
  BearerTokenBaseSchema,
  BearerTokenBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INITIATED),
  }).catchall(z.unknown()),
  BearerTokenBaseSchema.extend({
    status: z.literal(ConnectionStatuses.ACTIVE),
    token: z.string(),
  }).catchall(z.unknown()),
  BearerTokenBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INACTIVE),
    token: z.string(),
  }).catchall(z.unknown()),
  BearerTokenBaseSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  BearerTokenBaseSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);
const CustomBearerTokenConnectionDataSchema = BaseSchemeRaw.extend({
  token: z.string(),
}).catchall(z.unknown());

// GOOGLE_SERVICE_ACCOUNT
const GoogleServiceAccountBaseSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());
const GoogleServiceAccountConnectionDataSchema = z.discriminatedUnion('status', [
  GoogleServiceAccountBaseSchema,
  GoogleServiceAccountBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INITIATED),
    redirectUrl: z.string(),
    composio_link_redirect_url: z.string().optional(),
  }).catchall(z.unknown()),
  GoogleServiceAccountBaseSchema.extend({
    status: z.literal(ConnectionStatuses.ACTIVE),
    credentials_json: z.string(),
  }).catchall(z.unknown()),
  GoogleServiceAccountBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INACTIVE),
    credentials_json: z.string(),
  }).catchall(z.unknown()),
  GoogleServiceAccountBaseSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  GoogleServiceAccountBaseSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);

// NO_AUTH
const NoAuthBaseSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());
const NoAuthConnectionDataSchema = z.discriminatedUnion('status', [
  NoAuthBaseSchema,
  NoAuthBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INITIATED),
  }).catchall(z.unknown()),
  NoAuthBaseSchema.extend({
    status: z.literal(ConnectionStatuses.ACTIVE),
  }).catchall(z.unknown()),
  NoAuthBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INACTIVE),
  }).catchall(z.unknown()),
  NoAuthBaseSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  NoAuthBaseSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);
const CustomNoAuthConnectionDataSchema = BaseSchemeRaw.catchall(z.unknown());

// CALCOM_AUTH
const CalcomAuthBaseSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());
const CalcomAuthConnectionDataSchema = z.discriminatedUnion('status', [
  CalcomAuthBaseSchema,
  CalcomAuthBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INITIATED),
  }).catchall(z.unknown()),
  CalcomAuthBaseSchema.extend({
    status: z.literal(ConnectionStatuses.ACTIVE),
  }).catchall(z.unknown()),
  CalcomAuthBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INACTIVE),
  }).catchall(z.unknown()),
  CalcomAuthBaseSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  CalcomAuthBaseSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);

// SNOWFLAKE
// const SnowflakeInitiatingSchema = BaseSchemeRaw.extend({
//   status: z.literal(ConnectionStatuses.ACTIVE),
// }).catchall(z.unknown());
// const SnowflakeConnectionDataSchema = z.discriminatedUnion('status', [
//   SnowflakeInitiatingSchema,
//   SnowflakeInitiatingSchema.extend({
//     status: z.literal(ConnectionStatuses.FAILED),
//     error: z.string().optional(),
//     error_description: z.string().optional(),
//   }).catchall(z.unknown()),
//   SnowflakeInitiatingSchema.extend({
//     status: z.literal(ConnectionStatuses.EXPIRED),
//     expired_at: z.string().optional(),
//   }).catchall(z.unknown()),
// ]);

// BASIC_WITH_JWT
const BasicWithJwtBaseSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());
const BasicWithJwtConnectionDataSchema = z.discriminatedUnion('status', [
  BasicWithJwtBaseSchema,
  BasicWithJwtBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INITIATED),
  }).catchall(z.unknown()),
  BasicWithJwtBaseSchema.extend({
    status: z.literal(ConnectionStatuses.ACTIVE),
    username: z.string(),
    password: z.string(),
  }).catchall(z.unknown()),
  BasicWithJwtBaseSchema.extend({
    status: z.literal(ConnectionStatuses.INACTIVE),
    username: z.string(),
    password: z.string(),
  }).catchall(z.unknown()),
  BasicWithJwtBaseSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    username: z.string(),
    password: z.string(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  BasicWithJwtBaseSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    username: z.string(),
    password: z.string(),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);
const CustomBasicWithJwtConnectionDataSchema = BaseSchemeRaw.extend({
  username: z.string(),
  password: z.string(),
}).catchall(z.unknown());

// SERVICE_ACCOUNT
const ServiceAccountInitiatingSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());
const ServiceAccountConnectionDataSchema = z.discriminatedUnion('status', [
  ServiceAccountInitiatingSchema,
  ServiceAccountInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.INITIATED),
  }).catchall(z.unknown()),
  ServiceAccountInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.ACTIVE),
    application_id: z.string(),
    installation_id: z.string(),
    private_key: z.string(),
  }).catchall(z.unknown()),
  ServiceAccountInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.INACTIVE),
    application_id: z.string(),
    installation_id: z.string(),
    private_key: z.string(),
  }).catchall(z.unknown()),
]);
const CustomServiceAccountConnectionDataSchema = z
  .object({
    application_id: z.string(),
    installation_id: z.string(),
    private_key: z.string(),
  })
  .merge(BaseSchemeRaw)
  .catchall(z.unknown());

// SAML
const SamlInitiatingSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());
const SamlConnectionDataSchema = z.discriminatedUnion('status', [
  SamlInitiatingSchema,
  SamlInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.INITIATED),
  }).catchall(z.unknown()),
  SamlInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.ACTIVE),
  }).catchall(z.unknown()),
  SamlInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.INACTIVE),
  }).catchall(z.unknown()),
  SamlInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  SamlInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);
const CustomSamlConnectionDataSchema = BaseSchemeRaw.catchall(z.unknown());

// DCR_OAUTH
const DcrOauthInitiatingSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());
const DcrOauthConnectionDataSchema = z.discriminatedUnion('status', [
  DcrOauthInitiatingSchema,
  DcrOauthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.INITIATED),
    client_id: z.string(),
    redirectUrl: z.string(),
    client_secret: z.string().optional(),
    callback_url: z.string().optional(),
    client_id_issued_at: z.number().optional(),
    client_secret_expires_at: z.number().optional(),
    code_verifier: z.string().optional(),
    finalRedirectUri: z.string().optional(),
  }).catchall(z.unknown()),
  DcrOauthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.ACTIVE),
    access_token: z.string(),
    client_id: z.string(),
    token_type: z.string().optional(),
    refresh_token: z.string().nullish(),
    expires_in: z.union([z.string(), z.number(), z.null()]).optional(),
    scope: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
    id_token: z.string().optional(),
    client_secret: z.string().optional(),
    client_id_issued_at: z.number().optional(),
    client_secret_expires_at: z.number().optional(),
  }).catchall(z.unknown()),
  DcrOauthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.INACTIVE),
    access_token: z.string(),
    client_id: z.string(),
    token_type: z.string().optional(),
    refresh_token: z.string().nullish(),
    expires_in: z.union([z.string(), z.number(), z.null()]).optional(),
    scope: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
    id_token: z.string().optional(),
    client_secret: z.string().optional(),
    client_id_issued_at: z.number().optional(),
    client_secret_expires_at: z.number().optional(),
  }).catchall(z.unknown()),
  DcrOauthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  DcrOauthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);
const CustomDcrOauthConnectionDataSchema = z
  .object({
    access_token: z.string(),
    client_id: z.string(),
  })
  .merge(BaseSchemeRaw)
  .catchall(z.unknown());

export const ConnectionDataSchema = z.discriminatedUnion('authScheme', [
  z.object({
    authScheme: z.literal(AuthSchemeTypes.OAUTH1),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: Oauth1ConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.OAUTH2),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: Oauth2ConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.API_KEY),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: ApiKeyConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.BASIC),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: BasicConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.BEARER_TOKEN),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: BearerTokenConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.GOOGLE_SERVICE_ACCOUNT),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: GoogleServiceAccountConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.NO_AUTH),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: NoAuthConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.CALCOM_AUTH),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: CalcomAuthConnectionDataSchema,
  }),
  // z.object({
  //   authScheme: z.literal(AuthSchemeTypes.SNOWFLAKE),
  //   /**
  //    * the main connection data discriminated by auth scheme
  //    */
  //   val: SnowflakeConnectionDataSchema,
  // }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.BILLCOM_AUTH),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: BillcomAuthConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.BASIC_WITH_JWT),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: BasicWithJwtConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.SERVICE_ACCOUNT),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: ServiceAccountConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.SAML),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: SamlConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.DCR_OAUTH),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: DcrOauthConnectionDataSchema,
  }),
]);

export type ConnectionData = z.infer<typeof ConnectionDataSchema>;

export const CustomConnectionDataSchema = z.discriminatedUnion('authScheme', [
  z.object({
    authScheme: z.literal(AuthSchemeTypes.OAUTH2),
    toolkitSlug: z.string(),
    val: CustomOauth2ConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.DCR_OAUTH),
    toolkitSlug: z.string(),
    val: CustomDcrOauthConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.API_KEY),
    toolkitSlug: z.string(),
    val: CustomApiKeyConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.BASIC_WITH_JWT),
    toolkitSlug: z.string(),
    val: CustomBasicWithJwtConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.BASIC),
    toolkitSlug: z.string(),
    val: CustomBasicConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.BEARER_TOKEN),
    toolkitSlug: z.string(),
    val: CustomBearerTokenConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.OAUTH1),
    toolkitSlug: z.string(),
    val: CustomOauth1ConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.NO_AUTH),
    toolkitSlug: z.string(),
    val: CustomNoAuthConnectionDataSchema,
  }),
  z.object({
    authScheme: z.literal(AuthSchemeTypes.SERVICE_ACCOUNT),
    toolkitSlug: z.string(),
    val: CustomServiceAccountConnectionDataSchema,
  }),
]);

export type CustomConnectionData = z.infer<typeof CustomConnectionDataSchema>;
