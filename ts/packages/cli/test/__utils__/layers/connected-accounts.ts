import type {
  AuthConfigCreateParams,
  AuthConfigCreateResponse,
} from '@composio/client/resources/auth-configs';
import type { LinkCreateResponse } from '@composio/client/resources/link';
import { Array as Arr, Effect, Layer } from 'effect';
import type { AuthConfigItem } from 'src/models/auth-configs';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import {
  ComposioToolkitsRepository,
  type ComposioToolkitsRepositoryShape,
} from 'src/services/composio-clients';
import { makeToolkitsRepositoryStub } from '../services/toolkits-repository-stub';
import { notFoundError } from './not-found';
import { DEFAULT_PAGE_LIMIT } from './page';

/**
 * The auth configs a test repository serves, and what creating one answers.
 */
export interface AuthConfigsTestData {
  items?: AuthConfigItem[];
  createResponse?: AuthConfigCreateResponse;
  onCreate?: (params: AuthConfigCreateParams) => void;
}

/**
 * The connected accounts a test serves, and what linking a new one answers.
 */
export interface ConnectedAccountsTestData {
  items?: ConnectedAccountItem[];
  linkResponse?: LinkCreateResponse;
  onDelete?: (nanoid: string) => void;
}

/**
 * `AuthConfigsTestData` with no auth configs and the default create response
 * when the test left them out.
 */
export const resolveAuthConfigsTestData = (data?: AuthConfigsTestData) => {
  const defaults = {
    items: [] as AuthConfigItem[],
    createResponse: undefined as AuthConfigCreateResponse | undefined,
  } satisfies AuthConfigsTestData;
  return {
    ...defaults,
    ...(data ?? {}),
  };
};

/**
 * `ConnectedAccountsTestData` with no connected accounts and the default link
 * response when the test left them out.
 */
export const resolveConnectedAccountsTestData = (data?: ConnectedAccountsTestData) => {
  const defaults = {
    items: [] as ConnectedAccountItem[],
    linkResponse: undefined as LinkCreateResponse | undefined,
  } satisfies ConnectedAccountsTestData;
  return {
    ...defaults,
    ...(data ?? {}),
  };
};

export type ResolvedAuthConfigsTestData = ReturnType<typeof resolveAuthConfigsTestData>;
export type ResolvedConnectedAccountsTestData = ReturnType<typeof resolveConnectedAccountsTestData>;

/**
 * The item with `id`, or the 404 `notFound` describes.
 */
const findById = <A extends { readonly id: string }>(
  items: ReadonlyArray<A>,
  id: string,
  notFound: () => ReturnType<typeof notFoundError>
) =>
  Effect.fromOption(
    Arr.findFirst(items, item => item.id === id),
    notFound
  );

/**
 * The repository methods this family serves.
 */
export type ConnectedAccountRepositoryMethod =
  'listAuthConfigs' | 'getAuthConfig' | 'createAuthConfig' | 'getConnectedAccount';

export type ConnectedAccountRepositoryMethods = Pick<
  ComposioToolkitsRepositoryShape,
  ConnectedAccountRepositoryMethod
>;

/**
 * The repository's auth-config and connected-account methods, answering from
 * the test data the way the API would.
 */
export const connectedAccountRepositoryMethods = (
  authConfigsData: ResolvedAuthConfigsTestData,
  connectedAccountsData: ResolvedConnectedAccountsTestData
): ConnectedAccountRepositoryMethods => ({
  listAuthConfigs: (params: {
    search?: string;
    toolkit_slug?: string;
    limit?: number;
    show_disabled?: boolean;
  }) => {
    let results = [...authConfigsData.items];

    if (params.toolkit_slug) {
      const slugs = params.toolkit_slug.split(',').map(s => s.trim().toLowerCase());
      results = results.filter(item => slugs.includes(item.toolkit.slug.toLowerCase()));
    }

    if (params.search) {
      const q = params.search.toLowerCase();
      results = results.filter(
        item => item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
      );
    }

    const limit = params.limit ?? DEFAULT_PAGE_LIMIT;
    const items = results.slice(0, limit);
    return Effect.succeed({
      items,
      total_items: results.length,
      total_pages: Math.ceil(results.length / limit),
      current_page: 1,
      next_cursor: null,
    });
  },
  getAuthConfig: (nanoid: string) =>
    findById(authConfigsData.items, nanoid, () =>
      notFoundError(`Auth config "${nanoid}" not found`, {
        message: `Auth config "${nanoid}" not found.`,
        suggested_fix: 'Check the auth config ID and try again.',
      })
    ),
  createAuthConfig: (params: AuthConfigCreateParams) => {
    authConfigsData.onCreate?.(params);
    return Effect.succeed(
      authConfigsData.createResponse ?? {
        auth_config: { id: 'ac_test', auth_scheme: 'OAUTH2', is_composio_managed: true },
        toolkit: { slug: 'test' },
      }
    );
  },
  getConnectedAccount: (nanoid: string) =>
    findById(connectedAccountsData.items, nanoid, () =>
      notFoundError(`Connected account "${nanoid}" not found`, {
        message: `Connected account "${nanoid}" not found.`,
        suggested_fix: 'Check the connected account ID and try again.',
      })
    ),
});

/**
 * The mock client's `link` and `connectedAccounts` resources, answering from
 * `connectedAccountsData`. The `connectedAccounts.list` answer never pages
 * (`next_cursor` is null).
 */
export const mockConnectedAccountResources = (
  connectedAccountsData: ResolvedConnectedAccountsTestData
) => ({
  link: {
    create: async (params: { auth_config_id: string; user_id: string }) => {
      const response = connectedAccountsData.linkResponse ?? {
        connected_account_id: 'con_test_link',
        expires_at: '2026-12-31T23:59:59Z',
        link_token: 'lt_test_token',
        redirect_url: `https://app.composio.dev/link?token=lt_test_token`,
      };
      return response;
    },
  },
  connectedAccounts: {
    list: async (params?: {
      toolkit_slugs?: string[];
      user_ids?: string[];
      statuses?: string[];
      limit?: number;
    }) => {
      let results = [...connectedAccountsData.items];

      if (params?.toolkit_slugs && params.toolkit_slugs.length > 0) {
        const slugs = new Set(params.toolkit_slugs.map(slug => slug.toLowerCase()));
        results = results.filter(item => slugs.has(item.toolkit.slug.toLowerCase()));
      }

      if (params?.user_ids && params.user_ids.length > 0) {
        const userIds = new Set(params.user_ids);
        results = results.filter(item => userIds.has(item.user_id));
      }

      if (params?.statuses && params.statuses.length > 0) {
        const statuses = new Set(params.statuses);
        results = results.filter(item => statuses.has(item.status));
      }

      const limit = params?.limit ?? DEFAULT_PAGE_LIMIT;
      return {
        items: results.slice(0, limit),
        total_items: results.length,
        total_pages: Math.ceil(results.length / limit),
        current_page: 1,
        next_cursor: null,
      };
    },
    retrieve: (nanoid: string) =>
      findById(connectedAccountsData.items, nanoid, () =>
        notFoundError(`Connected account "${nanoid}" not found`)
      ),
    delete: (nanoid: string) =>
      findById(connectedAccountsData.items, nanoid, () =>
        notFoundError(`Connected account "${nanoid}" not found`)
      ).pipe(
        Effect.tap(() => Effect.sync(() => connectedAccountsData.onDelete?.(nanoid))),
        Effect.as({})
      ),
  },
});

/**
 * A `ComposioToolkitsRepository` that serves only auth configs and connected
 * accounts, for a test that needs nothing else from the full `TestLive` layer.
 * Any other repository method dies.
 */
export const ConnectedAccountsTest = (data?: {
  readonly authConfigsData?: AuthConfigsTestData;
  readonly connectedAccountsData?: ConnectedAccountsTestData;
}) =>
  Layer.succeed(
    ComposioToolkitsRepository,
    makeToolkitsRepositoryStub(
      connectedAccountRepositoryMethods(
        resolveAuthConfigsTestData(data?.authConfigsData),
        resolveConnectedAccountsTestData(data?.connectedAccountsData)
      )
    )
  );
