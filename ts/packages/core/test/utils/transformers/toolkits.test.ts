import { describe, it, expect } from 'vitest';
import { transformToolkitRetrieveResponse } from '../../../src/utils/transformers/toolkits';

type RawRetrieveResponse = Parameters<typeof transformToolkitRetrieveResponse>[0];

/**
 * The API describes every auth form field with an `is_secret` flag ("Clients use
 * it to decide whether to mask the input"), a `legacy_template_name`, and every
 * auth method with an `auth_hint_url`. All three are snake_case on the wire, so a
 * pass-through leaves them under keys the zod schema does not know and validation
 * strips them.
 *
 * Every one of the four field groups is populated here, because the transformer
 * maps each of them separately.
 */
const rawToolkit = {
  name: 'Shopify',
  slug: 'shopify',
  meta: {
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    tools_count: 12,
    triggers_count: 3,
  },
  is_local_toolkit: false,
  composio_managed_auth_schemes: ['OAUTH2'],
  auth_config_details: [
    {
      name: 'API Key',
      mode: 'API_KEY',
      auth_hint_url: 'https://shopify.dev/api-keys',
      fields: {
        auth_config_creation: {
          required: [
            {
              name: 'client_secret',
              displayName: 'Client Secret',
              description: 'The app client secret',
              type: 'string',
              required: true,
              is_secret: true,
              legacy_template_name: 'clientSecret',
            },
          ],
          optional: [
            {
              name: 'scopes',
              displayName: 'Scopes',
              description: 'Comma separated scopes',
              type: 'string',
              required: false,
              is_secret: false,
              default: null,
              legacy_template_name: 'oauthScopes',
            },
          ],
        },
        connected_account_initiation: {
          required: [
            {
              name: 'api_key',
              displayName: 'API Key',
              description: 'Your Shopify API key',
              type: 'string',
              required: true,
              is_secret: true,
              legacy_template_name: 'apiKey',
            },
          ],
          optional: [
            {
              name: 'shop_domain',
              displayName: 'Shop Domain',
              description: 'your-store.myshopify.com',
              type: 'string',
              required: false,
              is_secret: false,
              default: 'example.myshopify.com',
            },
          ],
        },
      },
    },
  ],
} as unknown as RawRetrieveResponse;

/** Same shape, but the API omits every optional key. */
const rawToolkitWithoutOptionalKeys = {
  ...rawToolkit,
  auth_config_details: [
    {
      name: 'Bearer',
      mode: 'BEARER_TOKEN',
      fields: {
        auth_config_creation: { required: [], optional: [] },
        connected_account_initiation: {
          required: [
            {
              name: 'token',
              displayName: 'Token',
              description: 'A bearer token',
              type: 'string',
              required: true,
            },
          ],
          optional: [],
        },
      },
    },
  ],
} as unknown as RawRetrieveResponse;

const initiationRequired = (raw: RawRetrieveResponse) =>
  transformToolkitRetrieveResponse(raw).authConfigDetails?.[0].fields.connectedAccountInitiation
    .required[0];

describe('transformToolkitRetrieveResponse', () => {
  it('preserves is_secret as isSecret in all four auth field groups', () => {
    const fields = transformToolkitRetrieveResponse(rawToolkit).authConfigDetails?.[0].fields;

    expect(fields?.authConfigCreation.required[0].isSecret).toBe(true);
    expect(fields?.authConfigCreation.optional[0].isSecret).toBe(false);
    expect(fields?.connectedAccountInitiation.required[0].isSecret).toBe(true);
    expect(fields?.connectedAccountInitiation.optional[0].isSecret).toBe(false);
  });

  it('preserves legacy_template_name as legacyTemplateName', () => {
    const fields = transformToolkitRetrieveResponse(rawToolkit).authConfigDetails?.[0].fields;

    expect(fields?.authConfigCreation.required[0].legacyTemplateName).toBe('clientSecret');
    expect(fields?.authConfigCreation.optional[0].legacyTemplateName).toBe('oauthScopes');
    expect(fields?.connectedAccountInitiation.required[0].legacyTemplateName).toBe('apiKey');
  });

  it('maps a whole field without losing or inventing keys', () => {
    expect(initiationRequired(rawToolkit)).toEqual({
      name: 'api_key',
      displayName: 'API Key',
      description: 'Your Shopify API key',
      type: 'string',
      required: true,
      isSecret: true,
      legacyTemplateName: 'apiKey',
    });
  });

  it('keeps a null default and a false flag rather than dropping them', () => {
    const field =
      transformToolkitRetrieveResponse(rawToolkit).authConfigDetails?.[0].fields.authConfigCreation
        .optional[0];

    expect(field?.default).toBeNull();
    expect(field?.isSecret).toBe(false);
  });

  it('maps auth_hint_url to authHintUrl', () => {
    const details = transformToolkitRetrieveResponse(rawToolkit).authConfigDetails?.[0];

    expect(details?.authHintUrl).toBe('https://shopify.dev/api-keys');
  });

  /**
   * `toEqual` treats a missing property and one holding `undefined` as equal, so
   * these assertions use `toHaveProperty`. Creating the key unconditionally would
   * override a caller's fallback in `{ default: 'fallback', ...field }`.
   */
  it('omits optional keys entirely when the API does not send them', () => {
    const field = initiationRequired(rawToolkitWithoutOptionalKeys);

    expect(field).not.toHaveProperty('default');
    expect(field).not.toHaveProperty('isSecret');
    expect(field).not.toHaveProperty('legacyTemplateName');
    expect(
      transformToolkitRetrieveResponse(rawToolkitWithoutOptionalKeys).authConfigDetails?.[0]
    ).not.toHaveProperty('authHintUrl');
  });

  it('lets a caller fallback survive spreading a field with no default', () => {
    const field = initiationRequired(rawToolkitWithoutOptionalKeys);

    expect({ default: 'caller fallback', ...field }.default).toBe('caller fallback');
  });
});
