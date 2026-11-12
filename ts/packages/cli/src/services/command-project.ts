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
    | 'org_mismatch'
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
    message: 'No current org configured. Run `composio login` or `composio orgs switch`.',
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

/**
 * The developer project the working directory is set up for. A project file in another org
 * than the logged-in one is refused: a cloned repository's `.composio/` must not send the
 * user's requests, and the credentials some of them carry, to a project its author chose.
 */
const resolveLocalDeveloperProject = (
  projectContext: ProjectContext['Service'],
  loggedInOrgId: Option.Option<string>
) =>
  Effect.gen(function* () {
    const localProject = yield* projectContext.resolve;
    if (Option.isNone(localProject)) {
      return yield* Effect.fail(
        new ProjectResolutionError({
          reason: 'missing_developer_project',
          message: 'No developer project configured for this directory. Run `composio dev init`.',
        })
      );
    }
    const { orgId, projectId, projectName } = localProject.value;
    if (Option.isSome(loggedInOrgId) && loggedInOrgId.value !== orgId) {
      return yield* Effect.fail(
        new ProjectResolutionError({
          reason: 'org_mismatch',
          message: `This directory is set up for a developer project in org "${orgId}", not in the org you are logged in to ("${loggedInOrgId.value}"). Run \`composio dev init\` to set it up in your org, or pass --project-name.`,
        })
      );
    }
    return {
      orgId,
      projectId,
      projectName: Option.getOrUndefined(projectName),
      projectType: 'DEVELOPER',
      source: 'developer-local-config',
    } satisfies ResolvedCommandProject;
  });

export const resolveCommandProject = (params: { mode: ProjectMode; projectName?: string }) =>
  Effect.gen(function* () {
    const ctx = yield* ComposioUserContext;
    const projectContext = yield* ProjectContext;
    const apiKey = Option.getOrUndefined(ctx.data.apiKey);
    if (!apiKey) {
      return yield* Effect.fail(missingOrg());
    }

    // The directory's own project needs no stored org: a key from `COMPOSIO_USER_API_KEY`
    // carries none, and the project file names its org.
    if (params.mode === 'developer' && !params.projectName) {
      return yield* resolveLocalDeveloperProject(projectContext, ctx.data.orgId);
    }

    const currentOrgId = yield* Option.match(ctx.data.orgId, {
      onNone: () => Effect.fail(missingOrg()),
      onSome: value => Effect.succeed(value),
    });

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

    return yield* resolveLocalDeveloperProject(projectContext, Option.some(currentOrgId));
  }).pipe(Effect.mapError(normalizeLookupError));
