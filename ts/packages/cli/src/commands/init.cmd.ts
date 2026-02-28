import path from 'node:path';
import { Command as CliCommand, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { FileSystem } from '@effect/platform';
import { ComposioUserContext } from 'src/services/user-context';
import { NodeProcess } from 'src/services/node-process';
import { projectKeysToJSON, type ProjectKeys } from 'src/models/project-keys';
import { userDataFromJSON } from 'src/models/user-data';
import {
  createProjectApiKey,
  getSessionInfo,
  listOrgProjects,
  type OrgProject,
} from 'src/services/composio-clients';
import * as constants from 'src/constants';
import { TerminalUI } from 'src/services/terminal-ui';
import { browserLogin, noBrowser as noBrowserOpt } from 'src/commands/login.cmd';
import { setupCacheDir } from 'src/effects/setup-cache-dir';

/**
 * `composio init` — Initialize a Composio project in the current directory.
 *
 * ## Behavior
 *
 * 1. **Project selection** — fetches projects from the API or accepts `--org-id`/`--project-id`.
 * 2. **Writes config** — saves `<cwd>/.composio/project.json`.
 *
 * ## Flags
 *
 * - `--yes` / `-y` — auto-select the first project from the list
 */

const orgIdOpt = Options.text('org-id').pipe(
  Options.optional,
  Options.withDescription('Organization ID (skip interactive picker)')
);

const projectIdOpt = Options.text('project-id').pipe(
  Options.optional,
  Options.withDescription('Project ID (skip interactive picker)')
);

const yesOpt = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDefault(false),
  Options.withDescription('Auto-select default org/project, else first project')
);

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------
/** Writes project keys to `<cwd>/.composio/` and creates a `.gitignore`. */
const writeProjectConfig = (composioDir: string, selected: ProjectKeys) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    yield* fs
      .makeDirectory(composioDir, { recursive: true })
      .pipe(Effect.catchAll(() => Effect.void));

    const projectJson = yield* projectKeysToJSON(selected);
    yield* fs.writeFileString(
      path.join(composioDir, constants.PROJECT_CONFIG_FILE_NAME),
      projectJson
    );

    // Create .composio/.gitignore to prevent accidental commits
    const gitignorePath = path.join(composioDir, '.gitignore');
    const gitignoreExists = yield* fs.exists(gitignorePath);
    if (!gitignoreExists) {
      yield* fs.writeFileString(gitignorePath, '*\n');
    }
  });

// ---------------------------------------------------------------------------
// Structured output helper
// ---------------------------------------------------------------------------

const makeOutputJson = (selected: ProjectKeys, composioDir: string) =>
  JSON.stringify({
    org_id: selected.orgId,
    project_id: selected.projectId,
    path: composioDir,
  });

const getGlobalUserApiKey = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cacheDir = yield* setupCacheDir;
    const userConfigPath = path.join(cacheDir, constants.USER_CONFIG_FILE_NAME);
    const exists = yield* fs.exists(userConfigPath);
    if (!exists) return undefined;

    const userDataRaw = yield* fs.readFileString(userConfigPath, 'utf8');
    const parsed = yield* userDataFromJSON(userDataRaw).pipe(Effect.option);
    if (Option.isNone(parsed)) return undefined;

    return Option.getOrUndefined(parsed.value.apiKey);
  });

const upsertEnvVar = (content: string, key: string, value: string): string => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${escapedKey}=.*$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  return content.trim().length ? `${content.trimEnd()}\n${line}\n` : `${line}\n`;
};

const ensureProjectApiKeyInEnv = (params: { cwd: string; selected: ProjectKeys }) =>
  Effect.gen(function* () {
    const { cwd, selected } = params;
    const ui = yield* TerminalUI;
    const fs = yield* FileSystem.FileSystem;
    const ctx = yield* ComposioUserContext;

    const envPath = path.join(cwd, '.env.local');
    const envExists = yield* fs.exists(envPath);
    const existingEnvContent = envExists ? yield* fs.readFileString(envPath, 'utf8') : '';
    const hasProjectApiKey = /^COMPOSIO_API_KEY=.*/m.test(existingEnvContent);
    const hasTestUserId = /^COMPOSIO_TEST_USER_ID=.*/m.test(existingEnvContent);

    const uakApiKey = yield* getGlobalUserApiKey();
    if (!uakApiKey) {
      yield* ui.log.warn('No global API key found; skipping .env.local creation.');
      return;
    }

    const sessionInfo = yield* getSessionInfo({
      baseURL: ctx.data.baseURL,
      apiKey: uakApiKey,
      orgId: selected.orgId,
      projectId: selected.projectId,
    });

    let projectApiKey = sessionInfo.api_key?.api_key ?? sessionInfo.api_key?.key ?? null;
    if (!projectApiKey && !hasProjectApiKey) {
      const dateSuffix = new Date().toISOString().slice(0, 10);
      projectApiKey = yield* createProjectApiKey({
        baseURL: ctx.data.baseURL,
        apiKey: uakApiKey,
        orgId: selected.orgId,
        projectId: selected.projectId,
        name: `composio-cli-${dateSuffix}`,
      });
    }

    const sessionUserId = sessionInfo.org_member.user_id ?? sessionInfo.org_member.id;
    const composioTestUserId = `pg-test-${sessionUserId}`;
    const composioDir = path.join(cwd, constants.PROJECT_COMPOSIO_DIR);

    let nextEnvContent = existingEnvContent;
    if (!hasProjectApiKey && projectApiKey) {
      nextEnvContent = upsertEnvVar(nextEnvContent, 'COMPOSIO_API_KEY', projectApiKey);
    }
    if (!hasTestUserId) {
      nextEnvContent = upsertEnvVar(nextEnvContent, 'COMPOSIO_TEST_USER_ID', composioTestUserId);
    }

    if (nextEnvContent !== existingEnvContent) {
      yield* fs.writeFileString(envPath, nextEnvContent);
    }
    yield* writeProjectConfig(composioDir, {
      ...selected,
      testUserId: Option.some(composioTestUserId),
    });
    if (nextEnvContent !== existingEnvContent) {
      yield* ui.log.step(
        envExists
          ? 'Updated .env.local with Composio credentials'
          : 'Created .env.local with Composio credentials'
      );
    }
  });

const logEnvCreationHttpError =
  (ui: TerminalUI) =>
  (e: { status?: number; details?: { message: string; suggestedFix: string }; cause?: unknown }) =>
    Effect.gen(function* () {
      yield* ui.log.warn('Could not create .env.local from session info.');
      if (e.status) {
        yield* ui.log.error(`HTTP ${e.status}`);
      }
      if (e.details) {
        yield* ui.log.error(e.details.message);
        yield* ui.log.step(e.details.suggestedFix);
      } else if (e.cause) {
        yield* ui.log.error(String(e.cause));
      }
    });

const logEnvCreationDecodingError = (ui: TerminalUI) => (e: { cause?: unknown }) =>
  Effect.gen(function* () {
    yield* ui.log.warn('Could not decode API key response; skipping .env.local creation.');
    if (e.cause) {
      yield* ui.log.error(String(e.cause));
    }
  });

const selectDefaultProject = (params: {
  projects: ReadonlyArray<OrgProject>;
  defaultOrgId: string;
  defaultProjectId?: string;
}): OrgProject | undefined => {
  const { projects, defaultOrgId, defaultProjectId } = params;
  const exactMatch = projects.find(p => p.org_id === defaultOrgId && p.id === defaultProjectId);
  if (exactMatch) return exactMatch;

  const sameOrgFirst = projects.find(p => p.org_id === defaultOrgId);
  if (sameOrgFirst) return sameOrgFirst;

  return projects[0];
};

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * CLI command to initialize a Composio project in the current directory.
 *
 * Creates `<cwd>/.composio/project.json` with org_id and project_id.
 *
 * Supports two modes:
 * 1. Interactive: Fetches projects from the API and prompts for selection
 * 2. Non-interactive: Accepts --org-id and --project-id flags for agents/CI
 *
 * @example
 * ```bash
 * composio init
 * composio init --org-id <org> --project-id <project>
 * ```
 */
export const initCmd = CliCommand.make(
  'init',
  {
    orgId: orgIdOpt,
    projectId: projectIdOpt,
    noBrowser: noBrowserOpt,
    yes: yesOpt,
  },
  ({ orgId, projectId, noBrowser, yes }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const proc = yield* NodeProcess;

      yield* ui.intro('composio init');

      const composioDir = path.join(proc.cwd, constants.PROJECT_COMPOSIO_DIR);

      // Agent-native path: --org-id and --project-id flags skip project picker
      if (Option.isSome(orgId) && Option.isSome(projectId)) {
        const selected: ProjectKeys = {
          orgId: orgId.value,
          projectId: projectId.value,
          projectName: Option.none(),
          orgName: Option.none(),
          email: Option.none(),
          testUserId: Option.none(),
        };

        yield* writeProjectConfig(composioDir, selected);
        yield* ensureProjectApiKeyInEnv({ cwd: proc.cwd, selected }).pipe(
          Effect.catchTag('services/HttpServerError', e =>
            Effect.gen(function* () {
              yield* Effect.logDebug('Failed to resolve project API key from session/info:', e);
              yield* logEnvCreationHttpError(ui)(e);
            })
          ),
          Effect.catchTag('services/HttpDecodingError', e =>
            Effect.gen(function* () {
              yield* Effect.logDebug('Failed to decode API key response:', e);
              yield* logEnvCreationDecodingError(ui)(e);
            })
          )
        );

        yield* ui.log.success(`Project initialized in ${composioDir}/`);
        yield* ui.log.info(
          'To switch your default global org/project later, run `composio orgs switch`.'
        );
        yield* ui.output(makeOutputJson(selected, composioDir));
        yield* ui.outro('');
        return;
      }

      yield* initInteractiveFlow({ composioDir, noBrowser, yes });
    })
).pipe(CliCommand.withDescription('Initialize a Composio project in the current directory.'));

/**
 * Interactive init flow — handles login, project selection, wizard, install.
 * Extracted to keep the main command handler under the line limit.
 */
const initInteractiveFlow = (params: { composioDir: string; noBrowser: boolean; yes: boolean }) =>
  Effect.gen(function* () {
    const { composioDir, noBrowser, yes } = params;
    const ui = yield* TerminalUI;
    const ctx = yield* ComposioUserContext;
    const proc = yield* NodeProcess;

    // 1. Ensure global user API key exists (ignore local/project keys).
    let globalApiKey = yield* getGlobalUserApiKey();
    if (!globalApiKey) {
      yield* ui.log.step('No credentials found. Logging in...');
      yield* browserLogin({ scope: 'project', noBrowser });
      globalApiKey = yield* getGlobalUserApiKey();
    }

    // 2. Fetch projects
    const orgIdValue = Option.getOrUndefined(ctx.data.orgId);
    const projectIdValue = Option.getOrUndefined(ctx.data.projectId);
    if (!globalApiKey || !orgIdValue) {
      yield* ui.log.warn('No global API key or org ID found. Please try `composio login` first.');
      yield* ui.outro('');
      return;
    }

    const orgProjects = yield* listOrgProjects({
      baseURL: ctx.data.baseURL,
      apiKey: globalApiKey,
      orgId: orgIdValue,
    }).pipe(
      Effect.catchTag('services/HttpServerError', e =>
        Effect.gen(function* () {
          yield* Effect.logDebug('Failed to list org projects:', e);
          yield* ui.log.warn('Could not fetch projects from the server.');
          yield* ui.log.info(
            'Use `composio init --org-id <org> --project-id <project>` to set up manually.'
          );
          yield* ui.outro('');
          return yield* Effect.fail(e);
        })
      ),
      Effect.catchTag('services/HttpDecodingError', e =>
        Effect.gen(function* () {
          yield* Effect.logDebug('Failed to decode org projects response:', e);
          yield* ui.log.warn('Unexpected response from the server.');
          yield* ui.log.info(
            'Use `composio init --org-id <org> --project-id <project>` to set up manually.'
          );
          yield* ui.outro('');
          return yield* Effect.fail(e);
        })
      )
    );

    if (orgProjects.data.length === 0) {
      yield* ui.log.warn('No projects found for your organization.');
      yield* ui.log.info(
        'Create a project at https://platform.composio.dev, then run `composio init` again.'
      );
      yield* ui.outro('');
      return;
    }

    // 3. Select a project
    const orgProjectToKeys = (p: OrgProject): ProjectKeys => ({
      orgId: p.org_id,
      projectId: p.id,
      projectName: Option.some(p.name),
      orgName: Option.none(),
      email: Option.some(p.email),
      testUserId: Option.none(),
    });

    const selectedProject: OrgProject =
      yes || orgProjects.data.length === 1
        ? (selectDefaultProject({
            projects: orgProjects.data,
            defaultOrgId: orgIdValue,
            defaultProjectId: projectIdValue,
          }) ?? orgProjects.data[0])
        : yield* ui.select<OrgProject>(
            'Select a project:',
            orgProjects.data.map(p => ({ value: p, label: p.name, hint: p.id }))
          );

    const selected = orgProjectToKeys(selectedProject);
    yield* ui.log.step(`Using project "${selectedProject.name}"`);

    // 4. Write project config
    yield* writeProjectConfig(composioDir, selected);
    yield* ensureProjectApiKeyInEnv({ cwd: proc.cwd, selected }).pipe(
      Effect.catchTag('services/HttpServerError', e =>
        Effect.gen(function* () {
          yield* Effect.logDebug('Failed to resolve project API key from session/info:', e);
          yield* logEnvCreationHttpError(ui)(e);
        })
      ),
      Effect.catchTag('services/HttpDecodingError', e =>
        Effect.gen(function* () {
          yield* Effect.logDebug('Failed to decode API key response:', e);
          yield* logEnvCreationDecodingError(ui)(e);
        })
      )
    );

    yield* ui.log.success(`Project initialized in ${composioDir}/`);
    yield* ui.log.info(
      'To switch your default global org/project later, run `composio orgs switch`.'
    );
    yield* ui.output(makeOutputJson(selected, composioDir));
    yield* ui.outro('');
  });
