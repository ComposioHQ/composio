import { z } from 'zod';
import { AuthSchemeTypes } from './authConfigs.types';

export const ConnectionStatuses = {
  INITIALIZING: 'INITIALIZING',
  INITIATED: 'INITIATED',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
} as const;
export type ConnectionStatusEnum = (typeof ConnectionStatuses)[keyof typeof ConnectionStatuses];

export const RedirectableAuthSchemeSchema = z.enum([
  AuthSchemeTypes.OAUTH1,
  AuthSchemeTypes.OAUTH2,
  AuthSchemeTypes.COMPOSIO_LINK,
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
  })
  .catchall(z.unknown());

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
  token_type: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
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

export const Oauth2ConnectionDataSchema = z.discriminatedUnion('status', [
  Oauth2InitiatingConnectionDataSchema,
  Oauth2InitiatedConnectionDataSchema,
  Oauth2ActiveConnectionDataSchema,
  Oauth2FailedConnectionDataSchema,
  Oauth2ExpiredConnectionDataSchema,
]);

export type Oauth2InitiatingConnectionData = z.infer<typeof Oauth2InitiatingConnectionDataSchema>;
export type Oauth2InitiatedConnectionData = z.infer<typeof Oauth2InitiatedConnectionDataSchema>;
export type Oauth2ActiveConnectionData = z.infer<typeof Oauth2ActiveConnectionDataSchema>;
export type Oauth2FailedConnectionData = z.infer<typeof Oauth2FailedConnectionDataSchema>;
export type Oauth2ExpiredConnectionData = z.infer<typeof Oauth2ExpiredConnectionDataSchema>;
export type Oauth2ConnectionData = z.infer<typeof Oauth2ConnectionDataSchema>;

// OAUTH1
export const Oauth1InitiatingConnectionDataSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());

export const Oauth1InitiatedConnectionDataSchema = Oauth1InitiatingConnectionDataSchema.extend({
  status: z.literal(ConnectionStatuses.INITIATED),
  oauth_token: z.string(),
  authUri: z.string(),
  oauth_token_secret: z.string(),
  redirectUrl: z.string(),
  callbackUrl: z.string().optional(),
}).catchall(z.unknown());

export const Oauth1ActiveConnectionDataSchema = Oauth1InitiatingConnectionDataSchema.extend({
  status: z.literal(ConnectionStatuses.ACTIVE),
  oauth_token: z.string(),
  consumer_key: z.string().optional(),
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

export const Oauth1ConnectionDataSchema = z.discriminatedUnion('status', [
  Oauth1InitiatingConnectionDataSchema,
  Oauth1InitiatedConnectionDataSchema,
  Oauth1ActiveConnectionDataSchema,
  Oauth1FailedConnectionDataSchema,
  Oauth1ExpiredConnectionDataSchema,
]);

export type Oauth1InitiatingConnectionData = z.infer<typeof Oauth1InitiatingConnectionDataSchema>;
export type Oauth1InitiatedConnectionData = z.infer<typeof Oauth1InitiatedConnectionDataSchema>;
export type Oauth1ActiveConnectionData = z.infer<typeof Oauth1ActiveConnectionDataSchema>;
export type Oauth1FailedConnectionData = z.infer<typeof Oauth1FailedConnectionDataSchema>;
export type Oauth1ExpiredConnectionData = z.infer<typeof Oauth1ExpiredConnectionDataSchema>;
export type Oauth1ConnectionData = z.infer<typeof Oauth1ConnectionDataSchema>;

// COMPOSIO_LINK_AUTH
const ComposioLinkInitiatingSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.INITIALIZING),
}).catchall(z.unknown());
export const ComposioLinkConnectionDataSchema = z.discriminatedUnion('status', [
  ComposioLinkInitiatingSchema,
  ComposioLinkInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.INITIATED),
    redirectUrl: z.string(),
  }).catchall(z.unknown()),
  ComposioLinkInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.ACTIVE),
  }).catchall(z.unknown()),
  ComposioLinkInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  ComposioLinkInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);

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
]);

// BASIC_WITH_JWT
const BasicWithJwtInitiatingSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.ACTIVE),
  username: z.string(),
  password: z.string(),
}).catchall(z.unknown());

export const BasicWithJwtConnectionDataSchema = z.discriminatedUnion('status', [
  BasicWithJwtInitiatingSchema,
  BasicWithJwtInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  BasicWithJwtInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);

// BASIC
const BasicInitiatingSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.ACTIVE),
  username: z.string(),
  password: z.string(),
}).catchall(z.unknown());
const BasicConnectionDataSchema = z.discriminatedUnion('status', [
  BasicInitiatingSchema,
  BasicInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  BasicInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);

// API_KEY
const ApiKeyInitiatingSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.ACTIVE),
  api_key: z.string(),
}).catchall(z.unknown());
const ApiKeyConnectionDataSchema = z.discriminatedUnion('status', [
  ApiKeyInitiatingSchema,
  ApiKeyInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  ApiKeyInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);

// BEARER_TOKEN
const BearerTokenInitiatingSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.ACTIVE),
  token: z.string(),
}).catchall(z.unknown());
const BearerTokenConnectionDataSchema = z.discriminatedUnion('status', [
  BearerTokenInitiatingSchema,
  BearerTokenInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  BearerTokenInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);

// GOOGLE_SERVICE_ACCOUNT
const GoogleServiceAccountInitiatingSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.ACTIVE),
  credentials_json: z.string(),
}).catchall(z.unknown());
const GoogleServiceAccountConnectionDataSchema = z.discriminatedUnion('status', [
  GoogleServiceAccountInitiatingSchema,
  GoogleServiceAccountInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  GoogleServiceAccountInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);

// NO_AUTH
const NoAuthInitiatingSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.ACTIVE),
}).catchall(z.unknown());
const NoAuthConnectionDataSchema = z.discriminatedUnion('status', [
  NoAuthInitiatingSchema,
  NoAuthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  NoAuthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);

// CALCOM_AUTH
const CalcomAuthInitiatingSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.ACTIVE),
}).catchall(z.unknown());
const CalcomAuthConnectionDataSchema = z.discriminatedUnion('status', [
  CalcomAuthInitiatingSchema,
  CalcomAuthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  CalcomAuthInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);

// SNOWFLAKE
const SnowflakeInitiatingSchema = BaseSchemeRaw.extend({
  status: z.literal(ConnectionStatuses.ACTIVE),
}).catchall(z.unknown());
const SnowflakeConnectionDataSchema = z.discriminatedUnion('status', [
  SnowflakeInitiatingSchema,
  SnowflakeInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.FAILED),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).catchall(z.unknown()),
  SnowflakeInitiatingSchema.extend({
    status: z.literal(ConnectionStatuses.EXPIRED),
    expired_at: z.string().optional(),
  }).catchall(z.unknown()),
]);

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
    authScheme: z.literal(AuthSchemeTypes.COMPOSIO_LINK),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: ComposioLinkConnectionDataSchema,
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
  z.object({
    authScheme: z.literal(AuthSchemeTypes.SNOWFLAKE),
    /**
     * the main connection data discriminated by auth scheme
     */
    val: SnowflakeConnectionDataSchema,
  }),
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
]);

export type ConnectionData = z.infer<typeof ConnectionDataSchema>;
