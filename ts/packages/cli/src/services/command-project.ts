import { isAPIError } from '@composio/client/effect';
import { Data, Effect, Option } from 'effect';
import { ExpectedFailure } from 'src/effects/expected-failure';
import { extractMessage } from 'src/utils/api-error-extraction';
import { ProjectContext } from './project-context';
import { ComposioUserContext } from './user-context';
import {
  resolveConsumerProject,
  findDeveloperProjectByName,
  DeveloperProjectNotFoundError,
  AmbiguousDeveloperProjectNameError,
} from './composio-account';

export type ProjectMode = 'consumer' | 'developer';

export type CliProjectType = 'CONSUMER' | 'DEVELOPER';

export type CliProjectResolutionSource =
  'consumer-default' | 'developer-project-name' | 'developer-local-config' | 'developer-explicit';

export interface ResolvedCommandProject {
  readonly orgId: string;
  readonly projectId: string;
  readonly projectName?: string;
  readonly projectType: CliProjectType;
  readonly consumerUserId?: string;
  readonly source: CliProjectResolutionSource;
}

/**
 * The command's project could not be determined from the CLI's state and flags. The message
 * names the command that fixes it; the invocation prints it as one line and exits 1.
 */
export class ProjectResolutionError extends Data.TaggedError('services/ProjectResolutionError')<{
  readonly reason:
    | 'missing_org'
    | 'missing_developer_project'
    | 'project_not_found'
    | 'ambiguous_project_name'
    | 'request_failed';
  readonly message: string;
  readonly cause?: unknown;
}> {
  get [ExpectedFailure]() {
    return true;
  }
}

const missingOrg = () =>
  new ProjectResolutionError({
    reason: 'missing_org',
    message: 'No current org configured. Run `composio login` or `composio dev orgs switch`.',
  });

/**
 * Lookup failures a user can act on become `ProjectResolutionError`; other client errors
 * (connection, configuration) keep their type.
 */
const normalizeLookupError = <E>(error: E): ProjectResolutionError | E => {
  if (error instanceof DeveloperProjectNotFoundError) {
    return new ProjectResolutionError({
      reason: 'project_not_found',
      message: `Developer project "${error.projectName}" was not found in org "${error.orgId}". Run \`composio dev init\` or \`composio dev projects list\`.`,
    });
  }
  if (error instanceof AmbiguousDeveloperProjectNameError) {
    return new ProjectResolutionError({
      reason: 'ambiguous_project_name',
      message: `Developer project name "${error.projectName}" is ambiguous in org "${error.orgId}". Use an exact unique project name.`,
    });
  }
  const apiMessage = isAPIError(error) ? extractMessage(error) : undefined;
  return apiMessage === undefined
    ? error
    : new ProjectResolutionError({ reason: 'request_failed', message: apiMessage, cause: error });
};

export const resolveCommandProject = (params: { mode: ProjectMode; projectName?: string }) =>
  Effect.gen(function* () {
    const ctx = yield* ComposioUserContext;
    const projectContext = yield* ProjectContext;
    const apiKey = Option.getOrUndefined(ctx.data.apiKey);
    const currentOrgId = yield* Option.match(ctx.data.orgId, {
      onNone: () => Effect.fail(missingOrg()),
      onSome: value => Effect.succeed(value),
    });

    if (!apiKey) {
      return yield* Effect.fail(missingOrg());
    }

    if (params.mode === 'consumer') {
      if (params.projectName) {
        const developerProject = yield* findDeveloperProjectByName({
          apiKey,
          orgId: currentOrgId,
          name: params.projectName,
        });

        return {
          orgId: currentOrgId,
          projectId: developerProject.id,
          projectName: developerProject.name,
          projectType: 'DEVELOPER',
          source: 'developer-project-name',
        } satisfies ResolvedCommandProject;
      }

      const consumerProject = yield* resolveConsumerProject({
        apiKey,
        orgId: currentOrgId,
      });

      return {
        orgId: consumerProject.org_id,
        projectId: consumerProject.project_nano_id,
        projectName: consumerProject.project_name,
        projectType: 'CONSUMER',
        consumerUserId: consumerProject.consumer_user_id,
        source: 'consumer-default',
      } satisfies ResolvedCommandProject;
    }

    if (params.projectName) {
      const developerProject = yield* findDeveloperProjectByName({
        apiKey,
        orgId: currentOrgId,
        name: params.projectName,
      });

      return {
        orgId: currentOrgId,
        projectId: developerProject.id,
        projectName: developerProject.name,
        projectType: 'DEVELOPER',
        source: 'developer-explicit',
      } satisfies ResolvedCommandProject;
    }

    const localProject = yield* projectContext.resolve;
    if (Option.isNone(localProject)) {
      return yield* Effect.fail(
        new ProjectResolutionError({
          reason: 'missing_developer_project',
          message: 'No developer project configured for this directory. Run `composio dev init`.',
        })
      );
    }

    return {
      orgId: localProject.value.orgId,
      projectId: localProject.value.projectId,
      projectName: Option.getOrUndefined(localProject.value.projectName),
      projectType: 'DEVELOPER',
      source: 'developer-local-config',
    } satisfies ResolvedCommandProject;
  }).pipe(Effect.mapError(normalizeLookupError));
