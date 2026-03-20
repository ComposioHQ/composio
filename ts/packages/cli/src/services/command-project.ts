import { Data, Effect, Option } from 'effect';
import { ProjectContext } from './project-context';
import { ComposioUserContext } from './user-context';
import {
  resolveConsumerProject,
  findDeveloperProjectByName,
  DeveloperProjectNotFoundError,
  AmbiguousDeveloperProjectNameError,
  type HttpDecodingError,
  type HttpServerError,
} from './composio-clients';

export type ProjectMode = 'consumer' | 'developer';

export type CliProjectType = 'CONSUMER' | 'DEVELOPER';

export type CliProjectResolutionSource =
  | 'consumer-default'
  | 'developer-project-name'
  | 'developer-local-config'
  | 'developer-explicit';

export interface ResolvedCommandProject {
  readonly orgId: string;
  readonly projectId: string;
  readonly projectName?: string;
  readonly projectType: CliProjectType;
  readonly consumerUserId?: string;
  readonly source: CliProjectResolutionSource;
}

export class MissingDefaultOrgError extends Data.TaggedError(
  'services/MissingDefaultOrgError'
)<{}> {}

export class MissingDeveloperProjectError extends Data.TaggedError(
  'services/MissingDeveloperProjectError'
)<{}> {}

const requireDefaultOrg = (orgId: Option.Option<string>) =>
  Option.match(orgId, {
    onNone: () => Effect.fail(new MissingDefaultOrgError()),
    onSome: value => Effect.succeed(value),
  });

export const resolveCommandProject = (params: { mode: ProjectMode; projectName?: string }) =>
  Effect.gen(function* () {
    const ctx = yield* ComposioUserContext;
    const projectContext = yield* ProjectContext;
    const apiKey = Option.getOrUndefined(ctx.data.apiKey);
    const currentOrgId = yield* requireDefaultOrg(ctx.data.orgId);

    if (!apiKey) {
      return yield* Effect.fail(new MissingDefaultOrgError());
    }

    if (params.mode === 'consumer') {
      if (params.projectName) {
        const developerProject = yield* findDeveloperProjectByName({
          baseURL: ctx.data.baseURL,
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
        baseURL: ctx.data.baseURL,
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
        baseURL: ctx.data.baseURL,
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
      return yield* Effect.fail(new MissingDeveloperProjectError());
    }

    return {
      orgId: localProject.value.orgId,
      projectId: localProject.value.projectId,
      projectName: Option.getOrUndefined(localProject.value.projectName),
      projectType: 'DEVELOPER',
      source: 'developer-local-config',
    } satisfies ResolvedCommandProject;
  }) as Effect.Effect<
    ResolvedCommandProject,
    | MissingDefaultOrgError
    | MissingDeveloperProjectError
    | DeveloperProjectNotFoundError
    | AmbiguousDeveloperProjectNameError
    | HttpServerError
    | HttpDecodingError
  >;

export const formatResolveCommandProjectError = (error: unknown): Error => {
  if (error instanceof MissingDefaultOrgError) {
    return new Error(
      'No default org configured. Run `composio login` or `composio manage orgs switch`.'
    );
  }
  if (error instanceof MissingDeveloperProjectError) {
    return new Error('No developer project configured for this directory. Run `composio init`.');
  }
  if (error instanceof DeveloperProjectNotFoundError) {
    return new Error(
      `Developer project "${error.projectName}" was not found in org "${error.orgId}". Run \`composio init\` or \`composio manage projects list\`.`
    );
  }
  if (error instanceof AmbiguousDeveloperProjectNameError) {
    return new Error(
      `Developer project name "${error.projectName}" is ambiguous in org "${error.orgId}". Use an exact unique project name.`
    );
  }
  if (typeof error === 'object' && error && 'details' in error) {
    const details = (error as { details?: { message?: string } }).details;
    if (details?.message) {
      return new Error(details.message);
    }
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
};
