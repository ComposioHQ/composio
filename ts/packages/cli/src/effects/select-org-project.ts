import { Effect } from 'effect';
import { TerminalUI } from 'src/services/terminal-ui';
import { listOrganizations, type OrganizationSummary } from 'src/services/composio-clients';
import { clampLimit } from 'src/ui/clamp-limit';

const DEFAULT_LIMIT = 50;

/** Prompts user to select an org, or auto-selects if only one. */
const selectOrganization = (params: {
  organizations: ReadonlyArray<OrganizationSummary>;
  currentOrgId?: string;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { organizations, currentOrgId } = params;
    if (organizations.length === 0) return undefined;
    if (organizations.length === 1) return organizations[0];

    const currentOrganization = currentOrgId
      ? organizations.find(org => org.id === currentOrgId)
      : undefined;
    const orderedOrganizations = currentOrganization
      ? [currentOrganization, ...organizations.filter(org => org.id !== currentOrganization.id)]
      : organizations;

    if (currentOrganization) {
      yield* ui.log.info(`Current org: "${currentOrganization.name}" (${currentOrganization.id})`);
    }

    return yield* ui.select('Select current organization:', [
      ...orderedOrganizations.map(org => ({
        value: org,
        label: org.name,
        hint: org.id === currentOrgId ? `${org.id} (current)` : org.id,
      })),
    ]);
  });

export const runOrgSelection = (params: {
  apiKey: string;
  baseURL: string;
  explicitOrgId?: string;
  currentOrgId?: string;
  limit?: number;
}) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { apiKey, baseURL, explicitOrgId, currentOrgId, limit = DEFAULT_LIMIT } = params;
    const clampedLimit = clampLimit(limit);

    const selectedOrganization =
      explicitOrgId !== undefined
        ? ({ id: explicitOrgId, name: explicitOrgId } satisfies OrganizationSummary)
        : yield* Effect.gen(function* () {
            const organizations = yield* listOrganizations({
              baseURL,
              apiKey,
              limit: clampedLimit,
            });
            yield* ui.log.info(`Loaded ${organizations.data.length} orgs`);
            if (organizations.data.length === 0) return undefined;
            return yield* selectOrganization({
              organizations: organizations.data,
              currentOrgId,
            });
          });

    if (!selectedOrganization) {
      yield* ui.log.warn('No organizations found for this API key.');
      return undefined;
    }

    yield* ui.log.info(
      `Selected organization: "${selectedOrganization.name}" (${selectedOrganization.id})`
    );

    return selectedOrganization;
  });
