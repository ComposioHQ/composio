import type {
  CustomDeleteToolkitResponse as RawCustomDeleteToolkitResponse,
  CustomSyncParams as RawCustomSyncParams,
  CustomSyncResponse as RawCustomSyncResponse,
  CustomUpsertParams as RawCustomUpsertParams,
  CustomUpsertResponse as RawCustomUpsertResponse,
} from '@composio/client/resources/custom';
import {
  CustomToolkitAuthScheme,
  CustomToolkitDeleteResponse,
  CustomToolkitDeleteResponseSchema,
  CustomToolkitSyncParams,
  CustomToolkitSyncResponse,
  CustomToolkitSyncResponseSchema,
  CustomToolkitUpsertParams,
  CustomToolkitUpsertResponse,
  CustomToolkitUpsertResponseSchema,
} from '../../types/customToolkits.types';
import { transform } from '../transform';

type RawCustomToolkitAuthScheme = RawCustomUpsertParams['toolkit_config']['auth_schemes'][number];

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
        api_key_field: scheme.apiKeyField && {
          display_name: scheme.apiKeyField.displayName,
          description: scheme.apiKeyField.description,
        },
      };
    case 'DCR_OAUTH':
      return { mode: 'DCR_OAUTH', discovery_url: scheme.discoveryUrl };
  }
};

export const transformCustomToolkitUpsertParams = (
  params: CustomToolkitUpsertParams
): RawCustomUpsertParams => ({
  slug: params.slug,
  toolkit_config: {
    name: params.toolkitConfig.name,
    app_url: params.toolkitConfig.appUrl,
    logo_file: params.toolkitConfig.logoFile && {
      content: params.toolkitConfig.logoFile.content,
      mime_type: params.toolkitConfig.logoFile.mimeType,
    },
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
