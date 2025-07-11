import {
  ToolkitRetrieveResponse as RawToolkitRetrieveResponse,
  ToolkitListResponse as RawToolkitListResponse,
  ToolkitRetrieveCategoriesResponse as RawToolkitRetrieveCategoriesResponse,
} from '@composio/client/resources/toolkits';
import {
  ToolKitListResponse,
  ToolKitListResponseSchema,
  ToolkitRetrieveResponse,
  ToolkitRetrieveResponseSchema,
  ToolkitRetrieveCategoriesResponse,
  ToolkitRetrieveCategoriesResponseSchema,
} from '../../types/toolkit.types';
import { transform } from '../transform';

export const transformToolkitListResponse = (
  response: RawToolkitListResponse
): ToolKitListResponse => {
  return transform(response)
    .with(ToolKitListResponseSchema)
    .using(response =>
      response.items.map(item => ({
        name: item.name,
        slug: item.slug,
        meta: {
          ...item.meta,
          categories: item.meta.categories?.map(category => ({
            slug: category.id,
            name: category.name,
          })),
          createdAt: item.meta.created_at,
          description: item.meta.description,
          logo: item.meta.logo,
          toolsCount: item.meta.tools_count,
          triggersCount: item.meta.triggers_count,
          updatedAt: item.meta.updated_at,
          appUrl: item.meta.app_url ?? undefined,
        },
        isLocalToolkit: item.is_local_toolkit,
        authSchemes: item.auth_schemes,
        composioManagedAuthSchemes: item.composio_managed_auth_schemes,
        noAuth: item.no_auth,
      }))
    );
};

export const transformToolkitRetrieveResponse = (
  response: RawToolkitRetrieveResponse
): ToolkitRetrieveResponse => {
  return transform(response)
    .with(ToolkitRetrieveResponseSchema)
    .using(response => ({
      name: response.name,
      slug: response.slug,
      meta: {
        ...response.meta,
        createdAt: response.meta.created_at,
        updatedAt: response.meta.updated_at,
        toolsCount: response.meta.tools_count,
        triggersCount: response.meta.triggers_count,
        categories: response.meta.categories?.map(category => ({
          slug: category.slug,
          name: category.name,
        })),
        // appUrl: response.meta.app_url, @TODO Update the client type to include this
      },
      isLocalToolkit: response.is_local_toolkit,
      composioManagedAuthSchemes: response.composio_managed_auth_schemes,
      authConfigDetails: response.auth_config_details?.map(authConfig => ({
        name: authConfig.name,
        mode: authConfig.mode,
        fields: {
          authConfigCreation: authConfig.fields.auth_config_creation,
          connectedAccountInitiation: authConfig.fields.connected_account_initiation,
        },
        proxy: {
          baseUrl: authConfig.proxy?.base_url,
        },
      })),
    }));
};

export const transformToolkitRetrieveCategoriesResponse = (
  response: RawToolkitRetrieveCategoriesResponse
): ToolkitRetrieveCategoriesResponse => {
  return transform(response)
    .with(ToolkitRetrieveCategoriesResponseSchema)
    .using(response => ({
      items: response.items.map(item => ({
        id: item.id,
        name: item.name,
      })),
      nextCursor: response.next_cursor ?? null,
      totalPages: response.total_pages,
    }));
};
