import type {
  CustomCreateToolkitParams as RawCustomCreateToolkitParams,
  CustomCreateToolkitResponse as RawCustomCreateToolkitResponse,
  CustomDeleteToolkitResponse as RawCustomDeleteToolkitResponse,
  CustomSyncParams as RawCustomSyncParams,
  CustomSyncResponse as RawCustomSyncResponse,
  CustomUpdateToolkitsParams as RawCustomUpdateToolkitsParams,
  CustomUpdateToolkitsResponse as RawCustomUpdateToolkitsResponse,
  CustomUpsertParams as RawCustomUpsertParams,
  CustomUpsertResponse as RawCustomUpsertResponse,
} from '@composio/client/resources/custom';
import {
  CustomToolkitApiKeyField,
  CustomToolkitAuthScheme,
  CustomToolkitCreateParams,
  CustomToolkitCreateResponse,
  CustomToolkitCreateResponseSchema,
  CustomToolkitDeleteResponse,
  CustomToolkitDeleteResponseSchema,
  CustomToolkitLogoFile,
  CustomToolkitSyncParams,
  CustomToolkitSyncResponse,
  CustomToolkitSyncResponseSchema,
  CustomToolkitUpdateParams,
  CustomToolkitUpdateResponse,
  CustomToolkitUpdateResponseSchema,
  CustomToolkitUpsertParams,
  CustomToolkitUpsertResponse,
  CustomToolkitUpsertResponseSchema,
} from '../../types/customToolkits.types';
import { transform } from '../transform';

type RawCustomToolkitAuthScheme = RawCustomCreateToolkitParams['auth_schemes'][number];
type RawCustomToolkitLogoFile = NonNullable<RawCustomCreateToolkitParams['logo_file']>;

const transformCustomToolkitLogoFile = (
  logoFile: CustomToolkitLogoFile | undefined
): RawCustomToolkitLogoFile | undefined =>
  logoFile && { content: logoFile.content, mime_type: logoFile.mimeType };

const transformCustomToolkitApiKeyField = (apiKeyField: CustomToolkitApiKeyField | undefined) =>
  apiKeyField && {
    display_name: apiKeyField.displayName,
    description: apiKeyField.description,
  };

const transformCustomToolkitAuthScheme = (
  scheme: CustomToolkitAuthScheme
): RawCustomToolkitAuthScheme => {
  switch (scheme.mode) {
    case 'NO_AUTH':
      return { mode: 'NO_AUTH' };
    case 'API_KEY':
      return {
        mode: 'API_KEY',
        headers: scheme.headers,
        api_key_field: transformCustomToolkitApiKeyField(scheme.apiKeyField),
        ...(scheme.additionalFields && {
          additional_fields: {
            generic_id: {
              display_name: scheme.additionalFields.genericId.displayName,
              description: scheme.additionalFields.genericId.description,
            },
          },
        }),
      };
    case 'DCR_OAUTH':
      return { mode: 'DCR_OAUTH', discovery_url: scheme.discoveryUrl };
  }
};

export const transformCustomToolkitCreateParams = (
  params: CustomToolkitCreateParams
): RawCustomCreateToolkitParams => ({
  name: params.name,
  mcp_url: params.mcpUrl,
  logo_file: transformCustomToolkitLogoFile(params.logoFile),
  auth_schemes: params.authSchemes.map(transformCustomToolkitAuthScheme),
  user_id: params.userId,
  callback_url: params.callbackUrl,
});

export const transformCustomToolkitCreateResponse = (
  response: RawCustomCreateToolkitResponse
): CustomToolkitCreateResponse => {
  return transform(response)
    .with(CustomToolkitCreateResponseSchema)
    .using(response => ({
      slug: response.slug,
      connectLink: response.connect_link && {
        redirectUrl: response.connect_link.redirect_url,
        expiresAt: response.connect_link.expires_at,
        connectedAccountId: response.connect_link.connected_account_id,
      },
    }));
};

export const transformCustomToolkitUpdateParams = (
  params: CustomToolkitUpdateParams
): RawCustomUpdateToolkitsParams => ({
  name: params.name,
  logo_file: transformCustomToolkitLogoFile(params.logoFile),
  api_key_field: transformCustomToolkitApiKeyField(params.apiKeyField),
  user_id: params.userId,
});

export const transformCustomToolkitUpdateResponse = (
  response: RawCustomUpdateToolkitsResponse
): CustomToolkitUpdateResponse => {
  return transform(response)
    .with(CustomToolkitUpdateResponseSchema)
    .using(response => ({ success: response.success }));
};

export const transformCustomToolkitUpsertParams = (
  params: CustomToolkitUpsertParams
): RawCustomUpsertParams => ({
  slug: params.slug,
  toolkit_config: {
    name: params.toolkitConfig.name,
    mcp_url: params.toolkitConfig.mcpUrl,
    logo_file: transformCustomToolkitLogoFile(params.toolkitConfig.logoFile),
    auth_schemes: params.toolkitConfig.authSchemes.map(transformCustomToolkitAuthScheme),
  },
});

export const transformCustomToolkitUpsertResponse = (
  response: RawCustomUpsertResponse
): CustomToolkitUpsertResponse => {
  return transform(response)
    .with(CustomToolkitUpsertResponseSchema)
    .using(response => ({ slug: response.slug }));
};

export const transformCustomToolkitSyncParams = (
  slug: string,
  params: CustomToolkitSyncParams
): RawCustomSyncParams => ({
  slug,
  connected_account_id: params.connectedAccountId,
});

export const transformCustomToolkitSyncResponse = (
  response: RawCustomSyncResponse
): CustomToolkitSyncResponse => {
  return transform(response)
    .with(CustomToolkitSyncResponseSchema)
    .using(response => ({
      slug: response.slug,
      version: response.version,
      syncedCount: response.synced_count,
    }));
};

export const transformCustomToolkitDeleteResponse = (
  response: RawCustomDeleteToolkitResponse
): CustomToolkitDeleteResponse => {
  return transform(response)
    .with(CustomToolkitDeleteResponseSchema)
    .using(response => ({
      slug: response.slug,
      deleted: response.deleted,
      revokeJobIds: response.revoke_job_ids,
      authConfigsDeleted: response.auth_configs_deleted,
      connectedAccountsDeleted: response.connected_accounts_deleted,
    }));
};
