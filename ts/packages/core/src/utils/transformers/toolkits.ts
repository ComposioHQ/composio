import {
  ToolkitRetrieveResponse as RawToolkitRetrieveResponse,
  ToolkitListResponse as RawToolkitListResponse,
  ToolkitRetrieveCategoriesResponse as RawToolkitRetrieveCategoriesResponse,
} from '@composio/client/resources/toolkits';
import {
  ToolKitListResponse,
  ToolKitListResponseSchema,
  ToolkitAuthField,
  ToolkitRetrieveResponse,
  ToolkitRetrieveResponseSchema,
  ToolkitRetrieveCategoriesResponse,
  ToolkitRetrieveCategoriesResponseSchema,
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
 * Most keys are already camelCase on the wire (`displayName`), but `is_secret`
 * and `legacy_template_name` are not, so the field needs an explicit mapping
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
});

const transformToolkitAuthFieldGroup = (group: {
  required: Array<RawToolkitAuthField>;
  optional: Array<RawToolkitAuthField>;
}) => ({
  required: group.required.map(transformToolkitAuthField),
  optional: group.optional.map(transformToolkitAuthField),
});

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
        availableVersions: response.meta.available_versions,
        // appUrl: response.meta.app_url, @TODO Update the client type to include this
      },
      isLocalToolkit: response.is_local_toolkit,
      composioManagedAuthSchemes: response.composio_managed_auth_schemes,
      authConfigDetails: response.auth_config_details?.map(authConfig => ({
        name: authConfig.name,
        mode: authConfig.mode,
        ...(authConfig.auth_hint_url !== undefined && {
          authHintUrl: authConfig.auth_hint_url,
        }),
        fields: {
          authConfigCreation: transformToolkitAuthFieldGroup(
            authConfig.fields.auth_config_creation
          ),
          connectedAccountInitiation: transformToolkitAuthFieldGroup(
            authConfig.fields.connected_account_initiation
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
