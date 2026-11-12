import { isAPIError } from '@composio/client/effect';
import { Data, Effect, Option, Predicate, Result } from 'effect';
import { ExpectedFailure } from 'src/effects/expected-failure';
import { extractMessage } from 'src/utils/api-error-extraction';
import { ProjectContext } from './project-context';
import { ComposioUserContext } from './user-context';
import {
  resolveConsumerProject,
  findDeveloperProjectByName,
  DeveloperProjectNotFoundError,
  AmbiguousDeveloperProjectNameError,
  getSessionInfoByUserApiKey,
  userKeyBelongsToOrg,
} from './composio-account';

export type ProjectMode = 'consumer' | 'developer';

export type CliProjectType = 'CONSUMER' | 'DEVELOPER';

export type CliProjectResolutionSource =
  | 'consumer-default'
  | 'developer-project-name'
  | 'developer-local-config'
  | 'developer-explicit'
  | 'developer-default';

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

/** Why the working directory's developer project cannot serve a command. */
type DirectoryProjectRefusal =
  | { readonly reason: 'missing_developer_project' }
  | {
      readonly reason: 'org_mismatch';
      readonly directoryOrgId: string;
      readonly storedOrgId: Option.Option<string>;
    };

const refusalError = (refusal: DirectoryProjectRefusal): ProjectResolutionError =>
  refusal.reason === 'missing_developer_project'
    ? new ProjectResolutionError({
        reason: 'missing_developer_project',
        message: 'No developer project configured for this directory. Run `composio dev init`.',
      })
    : new ProjectResolutionError({
        reason: 'org_mismatch',
        message: Option.match(refusal.storedOrgId, {
          onSome: storedOrgId =>
            `This directory is set up for a developer project in org "${refusal.directoryOrgId}", not in the org you are logged in to ("${storedOrgId}"). Run \`composio orgs switch\` to use that org, \`composio dev init\` to set this directory up in yours, or pass --project-name.`,
          onNone: () =>
            `This directory is set up for a developer project in org "${refusal.directoryOrgId}", which your API key cannot access. Run \`composio dev init\` to set it up in one of your orgs, or pass --project-name.`,
        }),
      });

/**
 * The developer project the working directory is set up for, or why it cannot be used. A cloned
 * repository's `.composio/` must not send the user's requests, and the credentials some of them
 * carry, to a project its author chose, so the project must be in the org the user is logged in
 * to. Without a stored org, as with a key from `COMPOSIO_USER_API_KEY`, it must be in an org the
 * key belongs to.
 */
const localDeveloperProject = (params: {
  projectContext: ProjectContext['Service'];
  apiKey: string;
  storedOrgId: Option.Option<string>;
}) =>
  Effect.gen(function* () {
    const localProject = yield* params.projectContext.resolve;
    if (Option.isNone(localProject)) {
      return Result.fail<DirectoryProjectRefusal>({ reason: 'missing_developer_project' });
    }
    const { orgId, projectId, projectName } = localProject.value;
    const allowed = yield* Option.match(params.storedOrgId, {
      onSome: storedOrgId => Effect.succeed(storedOrgId === orgId),
      onNone: () => userKeyBelongsToOrg({ apiKey: params.apiKey, orgId }),
    });
    if (!allowed) {
      return Result.fail<DirectoryProjectRefusal>({
        reason: 'org_mismatch',
        directoryOrgId: orgId,
        storedOrgId: params.storedOrgId,
      });
    }
    return Result.succeed({
      orgId,
      projectId,
      projectName: Option.getOrUndefined(projectName),
      projectType: 'DEVELOPER',
      source: 'developer-local-config',
    } satisfies ResolvedCommandProject);
  });

/** The directory's developer project; fails with `ProjectResolutionError` when it cannot be used. */
const resolveLocalDeveloperProject = (params: Parameters<typeof localDeveloperProject>[0]) =>
  localDeveloperProject(params).pipe(
    Effect.flatMap(result => Effect.fromResult(Result.mapError(result, refusalError)))
  );

/** What is wrong with the directory's developer project, as the start of a sentence. */
const refusalSummary = (refusal: DirectoryProjectRefusal): string =>
  refusal.reason === 'missing_developer_project'
    ? 'No developer project is set up for this directory'
    : Option.match(refusal.storedOrgId, {
        onSome: storedOrgId =>
          `This directory's developer project is in org "${refusal.directoryOrgId}", not the org you are logged in to ("${storedOrgId}")`,
        onNone: () =>
          `This directory's developer project is in org "${refusal.directoryOrgId}", which your API key cannot access`,
      });

/** The command that lets the directory's own developer project serve the next run. */
const refusalRemedy = (refusal: DirectoryProjectRefusal): string =>
  refusal.reason === 'missing_developer_project'
    ? 'Run `composio dev init` to choose one, or pass --project-name.'
    : Option.match(refusal.storedOrgId, {
        onSome: () =>
          "Run `composio orgs switch` to use the directory's org, or `composio dev init` to set this directory up in yours.",
        onNone: () => 'Run `composio dev init` to set this directory up in one of your orgs.',
      });

/** The stderr notice naming the default developer project a command uses instead. */
const defaultProjectNotice = (
  refusal: DirectoryProjectRefusal,
  project: ResolvedCommandProject,
  storedOrgId: Option.Option<string>
): string => {
  const which = Option.isSome(storedOrgId)
    ? 'the newest developer project in the org you are logged in to'
    : 'the newest developer project in the org you joined most recently';
  return `${refusalSummary(refusal)}; using "${project.projectName}" (${project.projectId}), ${which}, instead. ${refusalRemedy(refusal)}`;
};

/**
 * The developer project the backend acts on for a user-key request that names none: the newest
 * developer project of the stored org (sent as `x-org-id`, so `composio orgs switch` holds), or
 * without one, of the org the user joined most recently. Read once from session info, so every
 * request of the command names this one project even if another becomes the newest meanwhile.
 * Session info without a project, or an API error, means there is no such project; a connection
 * failure keeps its type.
 */
const defaultDeveloperProject = (params: {
  apiKey: string;
  storedOrgId: Option.Option<string>;
  refusal: DirectoryProjectRefusal;
}) =>
  getSessionInfoByUserApiKey({
    userApiKey: params.apiKey,
    orgId: Option.getOrUndefined(params.storedOrgId),
  }).pipe(
    Effect.map(
      info =>
        ({
          orgId: info.project.org.id,
          projectId: info.project.nano_id,
          projectName: info.project.name,
          projectType: 'DEVELOPER',
          source: 'developer-default',
        }) satisfies ResolvedCommandProject
    ),
    Effect.mapError(error =>
      isAPIError(error) || Predicate.isTagged(error, 'services/HttpDecodingError')
        ? new ProjectResolutionError({
            reason: 'missing_developer_project',
            message: `${refusalSummary(params.refusal)}, and no developer project was found in your org to use instead. Run \`composio dev init\` to set one up.`,
            cause: error,
          })
        : error
    )
  );

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
      return yield* resolveLocalDeveloperProject({
        projectContext,
        apiKey,
        storedOrgId: ctx.data.orgId,
      });
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

    return yield* resolveLocalDeveloperProject({
      projectContext,
      apiKey,
      storedOrgId: Option.some(currentOrgId),
    });
  }).pipe(Effect.mapError(normalizeLookupError));

/**
 * The developer project for a dev command that acted on the backend's default project before
 * it named one, so a directory without a usable project of its own keeps working: `--project-name`'s
 * (whose failures stay failures), else the directory's, else the backend's default developer
 * project (`defaultDeveloperProject`). `notice` says, for stderr, why the default stands in and
 * which project it is; it is none when the command uses the project it was given. The default
 * never stands in for a `--project-name` that cannot be resolved, and no request ever names a
 * directory project that fails the org check.
 */
export const resolveDeveloperProjectOrDefault = (params: { projectName?: string }) =>
  Effect.gen(function* () {
    if (params.projectName) {
      const project = yield* resolveCommandProject({
        mode: 'developer',
        projectName: params.projectName,
      });
      return { project, notice: Option.none<string>() };
    }
    const ctx = yield* ComposioUserContext;
    const projectContext = yield* ProjectContext;
    const apiKey = Option.getOrUndefined(ctx.data.apiKey);
    if (!apiKey) {
      return yield* Effect.fail(missingOrg());
    }
    const storedOrgId = ctx.data.orgId;
    const local = yield* localDeveloperProject({ projectContext, apiKey, storedOrgId });
    return yield* Result.match(local, {
      onSuccess: project => Effect.succeed({ project, notice: Option.none<string>() }),
      onFailure: refusal =>
        Effect.map(defaultDeveloperProject({ apiKey, storedOrgId, refusal }), project => ({
          project,
          notice: Option.some(defaultProjectNotice(refusal, project, storedOrgId)),
        })),
    });
  }).pipe(Effect.mapError(normalizeLookupError));
