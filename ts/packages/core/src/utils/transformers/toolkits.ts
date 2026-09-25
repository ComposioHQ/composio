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
  ToolkitAuthField,
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

type RawToolkitAuthConfigDetailFields = NonNullable<
  RawToolkitRetrieveResponse['auth_config_details']
>[number]['fields'];

/**
 * A single auth form field as the API ships it, across all four groups. The
 * generated client declares each group as its own interface; they are identical
 * today, so the union costs nothing and keeps the mapping honest if they ever
 * drift apart.
 *
 * Most keys are already camelCase on the wire (`displayName`), but `is_secret`,
 * `legacy_template_name`, and `user_visible` are not, so the field needs an explicit mapping
 * instead of a pass-through: a pass-through leaves them under keys the schema
 * does not know and zod strips them while validating.
 *
 * `type-tests/toolkit-auth-field-mapping.test-d.ts` fails the build when the
 * generated client grows a key in any of the four groups that is not listed
 * there.
 */
type RawToolkitAuthField =
  | RawToolkitAuthConfigDetailFields['auth_config_creation']['required'][number]
  | RawToolkitAuthConfigDetailFields['auth_config_creation']['optional'][number]
  | RawToolkitAuthConfigDetailFields['connected_account_initiation']['required'][number]
  | RawToolkitAuthConfigDetailFields['connected_account_initiation']['optional'][number];

const transformToolkitAuthField = (field: RawToolkitAuthField): ToolkitAuthField => ({
  name: field.name,
  displayName: field.displayName,
  description: field.description,
  type: field.type,
  required: field.required,
  // Optional keys are spread conditionally rather than assigned. Assigning an
  // absent wire key creates an own property holding `undefined`, which silently
  // beats a caller's fallback in `{ default: 'fallback', ...field }`. JSON never
  // carries an explicit `undefined`, so checking for it is the same test as
  // asking whether the server sent the key at all — and `null` and `false`
  // survive.
  ...(field.default !== undefined && { default: field.default }),
  ...(field.is_secret !== undefined && { isSecret: field.is_secret }),
  ...(field.legacy_template_name !== undefined && {
    legacyTemplateName: field.legacy_template_name,
  }),
  ...(field.user_visible !== undefined && { userVisible: field.user_visible }),
});

/**
 * Normalize one field group to empty lists when the API omits it, the way this
 * repo's own docs pipeline does (`docs/lib/toolkit-api.ts` defaults a missing
 * group to `{ required: [], optional: [] }`).
 *
 * The generated client declares both groups and both lists as required, but a
 * response that omits one reached zod and failed validation there. Mapping it
 * eagerly would instead throw a `TypeError` on the property access, before
 * validation, turning a handled validation error into a crash of
 * `toolkits.get()`. Normalizing also leaves the other group usable, which is
 * typically the one the caller asked for.
 */
const transformToolkitAuthFieldGroup = (
  group:
    | {
        required?: Array<RawToolkitAuthField> | null;
        optional?: Array<RawToolkitAuthField> | null;
      }
    | null
    | undefined
) => ({
  required: (group?.required ?? []).map(transformToolkitAuthField),
  optional: (group?.optional ?? []).map(transformToolkitAuthField),
});

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
        appUrl: response.meta.app_url ?? undefined,
      },
      isLocalToolkit: response.is_local_toolkit,
      composioManagedAuthSchemes: response.composio_managed_auth_schemes,
      authConfigDetails: response.auth_config_details?.map(authConfig => ({
        name: authConfig.name,
        mode: authConfig.mode,
        ...(authConfig.auth_hint_url !== undefined && {
          authHintUrl: authConfig.auth_hint_url,
        }),
        ...(authConfig.required_scopes !== undefined && {
          requiredScopes: authConfig.required_scopes,
        }),
        fields: {
          authConfigCreation: transformToolkitAuthFieldGroup(
            authConfig.fields?.auth_config_creation
          ),
          connectedAccountInitiation: transformToolkitAuthFieldGroup(
            authConfig.fields?.connected_account_initiation
          ),
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
