import type { ToolRetrieveResponse } from '@composio/client/resources/tools';
import { Effect, Layer, String } from 'effect';
import type {
  ToolkitVersionOverrides,
  ToolkitVersionSpec,
} from 'src/effects/toolkit-version-overrides';
import type { ToolkitDetailed, Toolkits } from 'src/models/toolkits';
import type { Tool, Tools } from 'src/models/tools';
import type { TriggerTypes, TriggerTypesAsEnums } from 'src/models/trigger-types';
import {
  ComposioToolkitsRepository,
  type ComposioToolkitsRepositoryShape,
  type ToolkitProjectScope,
} from 'src/services/composio-clients';
import {
  InvalidToolkitsError,
  InvalidToolkitVersionsError,
  type InvalidVersionDetail,
} from 'src/services/toolkit-version-validation';
import { makeToolkitsRepositoryStub } from '../services/toolkits-repository-stub';
import type { ConnectedAccountRepositoryMethod } from './connected-accounts';
import { notFoundError } from './not-found';
import { DEFAULT_PAGE_LIMIT } from './page';

/**
 * The toolkit, tool, and trigger-type catalogs a test repository serves.
 */
export interface ToolkitsTestData {
  toolkits?: Toolkits;
  /**
   * Custom toolkits registered in the test project. Kept apart from
   * `toolkits`, the Composio-managed catalog, as the API keeps them apart.
   */
  projectToolkits?: Toolkits;
  /**
   * The project `projectToolkits` belong to. When set, a project-toolkit
   * lookup for any other scope, or for none, finds nothing, as the API
   * would answer for another project.
   */
  projectToolkitsScope?: ToolkitProjectScope;
  /**
   * Called with the scope of every project-toolkit lookup.
   */
  onGetProjectToolkits?: (scope: ToolkitProjectScope | undefined) => void;
  detailedToolkits?: ToolkitDetailed[];
  tools?: Tools;
  triggerTypesAsEnums?: TriggerTypesAsEnums;
  triggerTypes?: TriggerTypes;
}

/**
 * `ToolkitsTestData` with every catalog the test left out set to empty.
 */
export const resolveToolkitsTestData = (data?: ToolkitsTestData) => {
  const defaults = {
    toolkits: [] as Toolkits,
    projectToolkits: [] as Toolkits,
    detailedToolkits: [] as ToolkitDetailed[],
    tools: [] as Tools,
    triggerTypesAsEnums: [] as TriggerTypesAsEnums,
    triggerTypes: [] as TriggerTypes,
  } satisfies ToolkitsTestData;
  return {
    ...defaults,
    ...(data ?? {}),
    detailedToolkits: data?.detailedToolkits ?? defaults.detailedToolkits,
  };
};

export type ResolvedToolkitsTestData = ReturnType<typeof resolveToolkitsTestData>;

/**
 * The repository methods other families serve: auth configs and connected accounts
 * (`connected-accounts.ts`), and trigger instances.
 */
type NonCatalogMethod =
  | ConnectedAccountRepositoryMethod
  | 'listActiveTriggers'
  | 'createTrigger'
  | 'enableTrigger'
  | 'disableTrigger';

export type ToolkitCatalogMethods = Omit<ComposioToolkitsRepositoryShape, NonCatalogMethod>;

const toClientTool = (tool: Tool): ToolRetrieveResponse => {
  // Derive toolkit slug from tool slug prefix (e.g. GMAIL_SEND_EMAIL -> gmail)
  const parts = tool.slug.split('_');
  const toolkitSlug = parts.length > 1 ? parts[0]!.toLowerCase() : '';
  return {
    ...tool,
    available_versions: [...tool.available_versions],
    tags: [...tool.tags],
    no_auth: false,
    version: 'latest',
    scopes: [],
    scope_requirements: null,
    is_deprecated: false,
    deprecated: {
      displayName: tool.name,
      version: 'latest',
      available_versions: [...tool.available_versions],
      is_deprecated: false,
      toolkit: { logo: '' },
    },
    toolkit: { name: toolkitSlug, slug: toolkitSlug, logo: '' },
  };
};

/**
 * The repository's catalog methods, answering from `toolkitsData` the way the API would.
 */
export const toolkitCatalogMethods = (
  toolkitsData: ResolvedToolkitsTestData
): ToolkitCatalogMethods => ({
  getToolkits: () => Effect.succeed(toolkitsData.toolkits),
  getProjectToolkits: scope =>
    Effect.sync(() => {
      toolkitsData.onGetProjectToolkits?.(scope);
      const owner = toolkitsData.projectToolkitsScope;
      const inScope =
        owner === undefined ||
        (scope?.orgId === owner.orgId && scope.projectId === owner.projectId);
      return inScope ? toolkitsData.projectToolkits : [];
    }),
  getToolkitsBySlugs: (slugs: ReadonlyArray<string>) => {
    const normalizedSlugs = new Set(slugs.map(s => String.toLowerCase(s)));
    const found = toolkitsData.toolkits.filter(t =>
      normalizedSlugs.has(String.toLowerCase(t.slug))
    );
    if (found.length !== slugs.length) {
      const foundSlugs = new Set(found.map(t => String.toLowerCase(t.slug)));
      const notFound = slugs.filter(s => !foundSlugs.has(String.toLowerCase(s)));
      return Effect.fail(
        new InvalidToolkitsError({
          invalidToolkits: [...notFound],
          availableToolkits: toolkitsData.toolkits.map(t => t.slug),
        })
      );
    }
    return Effect.succeed(found);
  },
  getMetrics: () => Effect.succeed({ byteSize: 0, requests: 0 }),
  getToolsAsEnums: () => Effect.succeed(toolkitsData.tools.map(tool => tool.slug)),
  getTriggerTypesAsEnums: () => Effect.succeed(toolkitsData.triggerTypesAsEnums),
  getTriggerTypes: (toolkitSlugs?: ReadonlyArray<string>) => {
    let triggers = toolkitsData.triggerTypes;
    if (toolkitSlugs && toolkitSlugs.length > 0) {
      const prefixes = toolkitSlugs.map(s => `${s.toUpperCase()}_`);
      triggers = triggers.filter(t => prefixes.some(p => t.slug.toUpperCase().startsWith(p)));
    }
    return Effect.succeed(triggers);
  },
  getTriggerTypeDetailed: (slug: string) => {
    const found = toolkitsData.triggerTypes.find(
      trigger => trigger.slug.toUpperCase() === slug.toUpperCase()
    );
    if (!found) {
      return Effect.fail(notFoundError(`Trigger type "${slug}" not found`));
    }
    return Effect.succeed(found);
  },
  getTools: (toolkitSlugs?: ReadonlyArray<string>) => {
    let tools = toolkitsData.tools;
    if (toolkitSlugs && toolkitSlugs.length > 0) {
      const prefixes = toolkitSlugs.map(s => `${s.toUpperCase()}_`);
      tools = tools.filter(t => prefixes.some(p => t.slug.toUpperCase().startsWith(p)));
    }
    return Effect.succeed(tools);
  },
  validateToolkits: (toolkitSlugs: ReadonlyArray<string>) => {
    const normalizedInputSlugs = toolkitSlugs.map(slug => String.toLowerCase(slug));
    const availableSlugs = toolkitsData.toolkits.map(toolkit => String.toLowerCase(toolkit.slug));
    const invalidSlugs = normalizedInputSlugs.filter(slug => !availableSlugs.includes(slug));

    if (invalidSlugs.length > 0) {
      return Effect.fail(
        new InvalidToolkitsError({
          invalidToolkits: invalidSlugs,
          availableToolkits: availableSlugs,
        })
      );
    }

    return Effect.succeed(normalizedInputSlugs);
  },
  filterToolkitsBySlugs: (toolkits, toolkitSlugs) => {
    const normalizedSlugs = new Set(toolkitSlugs.map(slug => String.toLowerCase(slug)));
    return toolkits.filter(toolkit => normalizedSlugs.has(String.toLowerCase(toolkit.slug)));
  },
  getToolsByVersionSpecs: (specs: ReadonlyArray<ToolkitVersionSpec>) => {
    // Filter tools based on toolkit slugs from specs
    const toolkitSlugs = specs.map(s => s.toolkitSlug.toUpperCase());
    const prefixes = toolkitSlugs.map(s => `${s}_`);
    const tools = toolkitsData.tools.filter(t =>
      prefixes.some(p => t.slug.toUpperCase().startsWith(p))
    );
    return Effect.succeed(tools);
  },
  validateToolkitVersions: (
    overrides: ToolkitVersionOverrides,
    relevantToolkits?: ReadonlyArray<string>
  ) => {
    // Mock implementation that validates against test fixture
    const invalidVersions: InvalidVersionDetail[] = [];
    const warnings: string[] = [];

    for (const [toolkit, version] of overrides) {
      // Check if toolkit should be validated
      if (relevantToolkits && !relevantToolkits.map(s => s.toLowerCase()).includes(toolkit)) {
        warnings.push(`Version override for "${toolkit}" will be ignored`);
        continue;
      }

      // Check if toolkit exists in the fixture
      const toolkitExists = toolkitsData.toolkits.some(t => String.toLowerCase(t.slug) === toolkit);

      if (!toolkitExists) {
        return Effect.fail(
          new InvalidToolkitsError({
            invalidToolkits: [toolkit],
            availableToolkits: toolkitsData.toolkits.map(t => t.slug),
          })
        );
      }

      // Mock: only accept 'latest' or versions matching pattern YYYYMMDD_NN
      const validPattern = /^\d{8}_\d{2}$/;
      if (version !== 'latest' && !validPattern.test(version)) {
        invalidVersions.push({
          toolkit,
          requestedVersion: version,
          availableVersions: ['20250901_00', '20250815_00', '20250710_00'],
        });
      }
    }

    if (invalidVersions.length > 0) {
      return Effect.fail(new InvalidToolkitVersionsError({ invalidVersions }));
    }

    return Effect.succeed({
      validatedOverrides: overrides,
      warnings: warnings as ReadonlyArray<string>,
    });
  },
  searchToolkits: (params: {
    search?: string;
    category?: string;
    limit?: number;
    cursor?: string;
  }) => {
    let results = [...toolkitsData.toolkits];

    if (params.search) {
      const q = params.search.toLowerCase();
      results = results.filter(
        t =>
          t.name.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          t.meta.description.toLowerCase().includes(q)
      );
    }

    const limit = params.limit ?? DEFAULT_PAGE_LIMIT;
    const items = results.slice(0, limit);
    return Effect.succeed({
      items,
      total_items: results.length,
      total_pages: Math.ceil(results.length / limit),
      next_cursor: null,
    });
  },
  searchTools: (params: {
    search?: string;
    toolkit_slug?: string;
    tags?: string;
    limit?: number;
    cursor?: string;
  }) => {
    let results = [...toolkitsData.tools];

    if (params.toolkit_slug) {
      const slugs = params.toolkit_slug.split(',').map(s => s.trim().toUpperCase() + '_');
      results = results.filter(t => slugs.some(p => t.slug.toUpperCase().startsWith(p)));
    }

    if (params.search) {
      const q = params.search.toLowerCase();
      results = results.filter(
        t =>
          t.name.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      );
    }

    if (params.tags) {
      const tagList = params.tags.split(',').map(t => t.trim().toLowerCase());
      results = results.filter(t =>
        tagList.some(tag => t.tags.map(tt => tt.toLowerCase()).includes(tag))
      );
    }

    const limit = params.limit ?? DEFAULT_PAGE_LIMIT;
    const items = results.slice(0, limit).map(toClientTool);
    return Effect.succeed({
      items,
      total_items: results.length,
      total_pages: Math.ceil(results.length / limit),
      current_page: 1,
      next_cursor: null,
    });
  },
  getToolDetailed: (slug: string) => {
    const found = toolkitsData.tools.find(t => t.slug.toUpperCase() === slug.toUpperCase());
    if (!found) {
      return Effect.fail(notFoundError(`Tool "${slug}" not found`));
    }
    return Effect.succeed(toClientTool(found));
  },
  getToolkitDetailed: (slug: string) => {
    const found = toolkitsData.detailedToolkits.find(
      t => t.slug.toLowerCase() === slug.toLowerCase()
    );
    if (!found) {
      return Effect.fail(notFoundError(`Toolkit "${slug}" not found`));
    }
    return Effect.succeed(found);
  },
});

/**
 * A `ComposioToolkitsRepository` that serves only the catalogs, for a test that needs nothing
 * else from the full `TestLive` layer. Any other repository method dies.
 */
export const ToolkitsTest = (data?: ToolkitsTestData) =>
  Layer.succeed(
    ComposioToolkitsRepository,
    makeToolkitsRepositoryStub(toolkitCatalogMethods(resolveToolkitsTestData(data)))
  );
