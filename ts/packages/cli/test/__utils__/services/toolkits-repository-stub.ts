import { Effect, Layer } from 'effect';
import {
  ComposioToolkitsRepository,
  type ComposioToolkitsRepositoryShape,
  type ToolkitProjectScope,
} from 'src/services/composio-clients';
import type { Toolkits } from 'src/models/toolkits';

export type GetToolkitsError = Effect.Error<
  ReturnType<ComposioToolkitsRepositoryShape['getToolkits']>
>;

const notUsed = (method: string) => () => Effect.die(`${method} is not used in this test`);

/**
 * Every repository method the toolkit-catalog suites do not exercise. A call
 * to any of them is a defect in the test, not a scenario to handle.
 */
const unusedRepositoryMethods = {
  getToolkitsBySlugs: notUsed('getToolkitsBySlugs'),
  getMetrics: notUsed('getMetrics'),
  getToolsAsEnums: notUsed('getToolsAsEnums'),
  getTools: notUsed('getTools'),
  getToolsByVersionSpecs: notUsed('getToolsByVersionSpecs'),
  getTriggerTypesAsEnums: notUsed('getTriggerTypesAsEnums'),
  getTriggerTypes: notUsed('getTriggerTypes'),
  getTriggerTypeDetailed: notUsed('getTriggerTypeDetailed'),
  validateToolkits: notUsed('validateToolkits'),
  validateToolkitVersions: notUsed('validateToolkitVersions'),
  // The repository's one synchronous method cannot return a dying Effect.
  filterToolkitsBySlugs: (): never => {
    throw new Error('filterToolkitsBySlugs is not used in this test');
  },
  searchToolkits: notUsed('searchToolkits'),
  getToolkitDetailed: notUsed('getToolkitDetailed'),
  searchTools: notUsed('searchTools'),
  getToolDetailed: notUsed('getToolDetailed'),
  listAuthConfigs: notUsed('listAuthConfigs'),
  getAuthConfig: notUsed('getAuthConfig'),
  createAuthConfig: notUsed('createAuthConfig'),
  getConnectedAccount: notUsed('getConnectedAccount'),
  listActiveTriggers: notUsed('listActiveTriggers'),
  createTrigger: notUsed('createTrigger'),
  enableTrigger: notUsed('enableTrigger'),
  disableTrigger: notUsed('disableTrigger'),
} as const;

export type GetProjectToolkitsError = Effect.Error<
  ReturnType<ComposioToolkitsRepositoryShape['getProjectToolkits']>
>;

/**
 * A repository whose every method dies unless the test overrides it.
 */
export const makeToolkitsRepositoryStub = (
  overrides: Partial<ComposioToolkitsRepositoryShape>
): ComposioToolkitsRepositoryShape =>
  ComposioToolkitsRepository.of({
    ...unusedRepositoryMethods,
    getToolkits: notUsed('getToolkits'),
    getProjectToolkits: notUsed('getProjectToolkits'),
    ...overrides,
  });

/**
 * A `ComposioToolkitsRepository` layer that counts catalog fetches, so a test
 * can assert not just what was resolved but what it cost. The native and
 * project-managed catalogs are counted separately.
 */
export const countingToolkitsRepository = (
  getToolkits: () => Effect.Effect<Toolkits, GetToolkitsError>,
  getProjectToolkits: (
    scope?: ToolkitProjectScope
  ) => Effect.Effect<Toolkits, GetProjectToolkitsError> = () => Effect.succeed([])
) => {
  let calls = 0;
  let projectCalls = 0;

  const layer = Layer.succeed(
    ComposioToolkitsRepository,
    ComposioToolkitsRepository.of({
      ...unusedRepositoryMethods,
      getToolkits: () =>
        Effect.suspend(() => {
          calls += 1;
          return getToolkits();
        }),
      getProjectToolkits: scope =>
        Effect.suspend(() => {
          projectCalls += 1;
          return getProjectToolkits(scope);
        }),
    })
  );

  return { layer, calls: () => calls, projectCalls: () => projectCalls };
};

/** The repository methods that act on a developer project's resources; each takes its scope first. */
const PROJECT_RESOURCE_METHODS = [
  'listAuthConfigs',
  'getAuthConfig',
  'createAuthConfig',
  'getConnectedAccount',
  'listActiveTriggers',
  'createTrigger',
  'enableTrigger',
  'disableTrigger',
] as const;

type ProjectResourceMethod = (typeof PROJECT_RESOURCE_METHODS)[number];

/** One project resource call: the method and the scope it was asked to act on. */
export interface RecordedRepositoryScope {
  readonly method: ProjectResourceMethod;
  readonly scope: unknown;
}

/**
 * A layer over a test layer's `ComposioToolkitsRepository` that records the scope every project
 * resource call names (its first argument), then answers as the test layer does.
 */
export const recordRepositoryScopes = () => {
  const calls: Array<RecordedRepositoryScope> = [];
  const layer = Layer.effect(
    ComposioToolkitsRepository,
    Effect.gen(function* () {
      const base = yield* ComposioToolkitsRepository;
      const recording = Object.fromEntries(
        PROJECT_RESOURCE_METHODS.map(method => {
          const call = base[method] as (
            ...args: ReadonlyArray<unknown>
          ) => Effect.Effect<unknown, unknown>;
          return [
            method,
            (...args: ReadonlyArray<unknown>) =>
              Effect.suspend(() => {
                calls.push({ method, scope: args[0] });
                return call(...args);
              }),
          ];
        })
      ) as Partial<ComposioToolkitsRepositoryShape>;
      return ComposioToolkitsRepository.of({ ...base, ...recording });
    })
  );
  return { calls, layer };
};
