import {
  ToolkitRetrieveResponse as RawToolkitRetrieveResponse,
  ToolkitListResponse as RawToolkitListResponse,
  ToolkitRetrieveCategoriesResponse as RawToolkitRetrieveCategoriesResponse,
  type Toolkits as ClientToolkits,
} from '@composio/client/resources/toolkits';

// The `/toolkits/multi` and `/toolkits/changelog` response types are only
// reachable through the resource class namespace on the published subpath.
type RawToolkitRetrieveChangelogResponse = ClientToolkits.ToolkitRetrieveChangelogResponse;
type RawToolkitRetrieveMultiResponse = ClientToolkits.ToolkitRetrieveMultiResponse;
type RawToolkitRecommendScopesParams = ClientToolkits.ToolkitRecommendScopesParams;
type RawToolkitRecommendScopesResponse = ClientToolkits.ToolkitRecommendScopesResponse;
type RawToolkitRetrieveScopesGrantContextParams =
  ClientToolkits.ToolkitRetrieveScopesGrantContextParams;
type RawToolkitRetrieveScopesGrantContextResponse =
  ClientToolkits.ToolkitRetrieveScopesGrantContextResponse;
import {
  ToolKitListResponse,
  ToolKitListResponseSchema,
  ToolkitRetrieveResponse,
  ToolkitRetrieveResponseSchema,
  ToolkitRetrieveCategoriesResponse,
  ToolkitRetrieveCategoriesResponseSchema,
  ToolkitChangelogResponse,
  ToolkitChangelogResponseSchema,
  ToolkitRecommendScopesParams,
  ToolkitRecommendScopesResponse,
  ToolkitRecommendScopesResponseSchema,
  ToolkitListGrantContextsParams,
  ToolkitListGrantContextsResponse,
  ToolkitListGrantContextsResponseSchema,
} from '../../types/toolkit.types';
import { transform } from '../transform';

/**
 * `GET /toolkits` and `POST /toolkits/multi` return the same item shape; the
 * generated client only names them differently per operation.
 */
export const transformToolkitListResponse = (
  response: RawToolkitListResponse | RawToolkitRetrieveMultiResponse
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
        availableVersions: response.meta.available_versions,
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
      baseUrl: response.base_url,
      getCurrentUserEndpoint: response.get_current_user_endpoint,
      getCurrentUserEndpointMethod: response.get_current_user_endpoint_method,
    }));
};

export const transformToolkitChangelogResponse = (
  response: RawToolkitRetrieveChangelogResponse
): ToolkitChangelogResponse => {
  return transform(response)
    .with(ToolkitChangelogResponseSchema)
    .using(response => ({
      items: response.items.map(item => ({
        slug: item.slug,
        name: item.name,
        displayName: item.display_name,
        versions: item.versions.map(version => ({
          version: version.version,
          changelog: version.changelog,
        })),
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

export const transformToolkitRecommendScopesParams = (
  params: ToolkitRecommendScopesParams
): RawToolkitRecommendScopesParams => ({
  tools: params.tools,
  auth_scheme: params.authScheme,
  toolkit_version: params.toolkitVersion,
  grant_context: params.grantContext,
  include: params.include,
  exclude: params.exclude,
  available_scopes: params.availableScopes,
});

export const transformToolkitRecommendScopesResponse = (
  response: RawToolkitRecommendScopesResponse
): ToolkitRecommendScopesResponse => {
  return transform(response)
    .with(ToolkitRecommendScopesResponseSchema)
    .using(response => ({
      authScheme: response.auth_scheme,
      toolkitVersion: response.toolkit_version,
      grantContext: response.grant_context,
      scopes: {
        leastPrivilege: response.scopes.least_privilege,
        fewest: response.scopes.fewest,
        conditional: response.scopes.conditional.map(condition => ({
          scope: condition.scope,
          when: condition.when,
          for: condition.for,
        })),
      },
    }));
};

export const transformToolkitListGrantContextsParams = (
  params: ToolkitListGrantContextsParams
): RawToolkitRetrieveScopesGrantContextParams => ({
  auth_scheme: params.authScheme,
  toolkit_version: params.toolkitVersion,
});

export const transformToolkitListGrantContextsResponse = (
  response: RawToolkitRetrieveScopesGrantContextResponse
): ToolkitListGrantContextsResponse => {
  return transform(response)
    .with(ToolkitListGrantContextsResponseSchema)
    .using(response => ({
      authScheme: response.auth_scheme,
      toolkitVersion: response.toolkit_version,
      grantContextDimensions: response.grant_context_dimensions.map(dimension => ({
        dimension: dimension.dimension,
        description: dimension.description,
        values: dimension.values,
      })),
      defaultGrantContext: response.default_grant_context,
    }));
};
