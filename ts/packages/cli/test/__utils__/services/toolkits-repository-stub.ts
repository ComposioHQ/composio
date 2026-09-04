import { Effect, Layer } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import type { Toolkits } from 'src/models/toolkits';

export type GetToolkitsError = Effect.Effect.Error<
  ReturnType<ComposioToolkitsRepository['getToolkits']>
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
  deleteAuthConfig: notUsed('deleteAuthConfig'),
  listConnectedAccounts: notUsed('listConnectedAccounts'),
  getConnectedAccount: notUsed('getConnectedAccount'),
  deleteConnectedAccount: notUsed('deleteConnectedAccount'),
  createConnectedAccountLink: notUsed('createConnectedAccountLink'),
  listActiveTriggers: notUsed('listActiveTriggers'),
  createTrigger: notUsed('createTrigger'),
  enableTrigger: notUsed('enableTrigger'),
  disableTrigger: notUsed('disableTrigger'),
  deleteTrigger: notUsed('deleteTrigger'),
} as const;

/**
 * A `ComposioToolkitsRepository` layer that counts catalog fetches, so a test
 * can assert not just what was resolved but what it cost.
 */
export const countingToolkitsRepository = (
  getToolkits: () => Effect.Effect<Toolkits, GetToolkitsError>
) => {
  let calls = 0;

  const layer = Layer.succeed(
    ComposioToolkitsRepository,
    new ComposioToolkitsRepository({
      ...unusedRepositoryMethods,
      getToolkits: () =>
        Effect.suspend(() => {
          calls += 1;
          return getToolkits();
        }),
    })
  );

  return { layer, calls: () => calls };
};
