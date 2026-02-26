import path from 'node:path';
import { Command as CliCommand, Options } from '@effect/cli';
import { Command as PlatformCommand } from '@effect/platform';
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
import { redact } from 'src/ui/redact';
import {
  ProjectEnvironmentDetector,
  type ProjectEnvironment,
} from 'src/services/project-environment-detector';
import { CommandRunner } from 'src/services/command-runner';
import {
  detectCoreDependencyPlan,
  resolveCoreDependencyState,
  type CoreDependencyPlan,
} from 'src/effects/core-dependency';
import {
  type AgentType,
  type InstallMode,
  type Skill,
  agents,
  cloneSkillsRepo,
  cleanupTempDir,
  SKILLS_MANUAL_COMMAND,
  discoverSkills,
  detectInstalledAgents,
  ensureUniversalAgents,
  selectAgentsInteractive,
  cancelSymbol,
  checkOverwrites,
  buildInstallationSummary,
  installAllSkills,
  buildInstallationResultDisplay,
  formatList,
} from 'src/skills';

/**
 * `composio init` — Initialize a Composio project in the current directory.
 *
 * ## Behavior
 *
 * 1. **Project selection** — fetches projects from the API or accepts `--org-id`/`--project-id`.
 * 2. **Usage mode** — asks "Native tools" vs "Composio MCP".
 * 3. **Framework** — if native, asks which agent framework.
 * 4. **Coding-agent skills** — asks whether to install Composio skills.
 * 5. **Environment detection** — detects language (TS/Python) and package manager.
 * 6. **Dependency installation** — installs `@composio/core` or `composio` via detected PM.
 * 7. **Writes config** — saves `<cwd>/.composio/project.json` and `<cwd>/.composio/config.json`.
 *
 * ## Flags
 *
 * - `--dry-run` — print install command without executing
 * - `--force` — reinstall even if dependency is already present
 * - `--yes` / `-y` — auto-select the first project from the list
 * - `--no-skills` — skip Composio skills installation
 */

const orgIdOpt = Options.text('org-id').pipe(
  Options.optional,
  Options.withDescription('Organization ID (skip interactive picker)')
);

const projectIdOpt = Options.text('project-id').pipe(
  Options.optional,
  Options.withDescription('Project ID (skip interactive picker)')
);

const dryRunOpt = Options.boolean('dry-run').pipe(
  Options.withDefault(false),
  Options.withDescription('Print install command without executing it')
);

const forceOpt = Options.boolean('force').pipe(
  Options.withDefault(false),
  Options.withDescription('Reinstall even if dependency appears installed')
);

const yesOpt = Options.boolean('yes').pipe(
  Options.withAlias('y'),
  Options.withDefault(false),
  Options.withDescription('Auto-select default org/project, else first project')
);

const noSkillsOpt = Options.boolean('no-skills').pipe(
  Options.withDefault(false),
  Options.withDescription('Skip Composio skills installation')
);

// ---------------------------------------------------------------------------
// Init config types and options
// ---------------------------------------------------------------------------

type UsageMode = 'native' | 'mcp';
type NativeFramework = 'ai-sdk' | 'mastra' | 'openai-agents' | 'claude-agent-sdk';

const USAGE_MODE_OPTIONS: ReadonlyArray<{
  value: UsageMode;
  label: string;
  hint: string;
}> = [
  {
    value: 'native',
    label: 'Native tools',
    hint: 'Use with Agent frameworks: AI SDK, Mastra, etc.',
  },
  {
    value: 'mcp',
    label: 'Composio MCP',
    hint: 'Use Composio tools via MCP',
  },
];

const NATIVE_FRAMEWORK_OPTIONS: ReadonlyArray<{
  value: NativeFramework;
  label: string;
}> = [
  { value: 'ai-sdk', label: 'AI SDK' },
  { value: 'mastra', label: 'Mastra' },
  { value: 'openai-agents', label: 'OpenAI Agents' },
  { value: 'claude-agent-sdk', label: 'Claude Agent SDK' },
];

// ---------------------------------------------------------------------------
// InitConfig — type-safe builder for the init wizard answers
// ---------------------------------------------------------------------------

class InitConfigBuilder<T extends Record<string, unknown> = Record<string, never>> {
  private constructor(private readonly data: T) {}

  static create(): InitConfigBuilder {
    return new InitConfigBuilder({});
  }

  withUsageMode(mode: UsageMode): InitConfigBuilder<T & { usageMode: UsageMode }> {
    return new InitConfigBuilder({ ...this.data, usageMode: mode });
  }

  withFrameworks(fws: NativeFramework[]): InitConfigBuilder<T & { frameworks: NativeFramework[] }> {
    return new InitConfigBuilder({ ...this.data, frameworks: fws });
  }

  withInstallSkills(install: boolean): InitConfigBuilder<T & { installSkills: boolean }> {
    return new InitConfigBuilder({ ...this.data, installSkills: install });
  }

  withDetectedEnv(
    env: ProjectEnvironment | undefined
  ): InitConfigBuilder<T & { detectedEnv: ProjectEnvironment | undefined }> {
    return new InitConfigBuilder({ ...this.data, detectedEnv: env });
  }

  withInstallPlan(
    plan: CoreDependencyPlan | undefined
  ): InitConfigBuilder<T & { installPlan: CoreDependencyPlan | undefined }> {
    return new InitConfigBuilder({ ...this.data, installPlan: plan });
  }

  /** Extract the final config. Only callable when all required fields are present. */
  build(
    this: InitConfigBuilder<{
      usageMode: UsageMode;
      frameworks: NativeFramework[];
      installSkills: boolean;
      detectedEnv: ProjectEnvironment | undefined;
      installPlan: CoreDependencyPlan | undefined;
    }>
  ): InitConfig {
    return {
      usageMode: this.data.usageMode,
      frameworks: this.data.frameworks,
      installSkills: this.data.installSkills,
      detectedEnv: this.data.detectedEnv,
      installPlan: this.data.installPlan,
    };
  }

  /** Read accumulated data (for intermediate access). */
  get value(): T {
    return this.data;
  }
}

interface InitConfig {
  readonly usageMode: UsageMode;
  readonly frameworks: NativeFramework[];
  readonly installSkills: boolean;
  readonly detectedEnv: ProjectEnvironment | undefined;
  readonly installPlan: CoreDependencyPlan | undefined;
}

// ---------------------------------------------------------------------------
// Init wizard — collects all answers via the builder
// ---------------------------------------------------------------------------

/**
 * Detect the project environment. Returns `undefined` if detection fails
 * (logs a warning but does not abort the wizard).
 */
const detectEnvironment = (cwd: string) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const envDetector = yield* ProjectEnvironmentDetector;

    return yield* envDetector.detectProjectEnvironment(cwd).pipe(
      Effect.tap(env => ui.log.step(`Detected: ${env.language} (${env.packageManager})`)),
      Effect.catchTag('services/ProjectEnvironmentDetectorError', e =>
        Effect.gen(function* () {
          yield* ui.log.warn(e.message);
          if (e.details) yield* ui.log.info(e.details);
          yield* ui.log.info('Skipping dependency installation.');
          return undefined;
        })
      )
    );
  });

/**
 * Resolve the install plan for the detected environment.
 * Only determines WHAT to install (no version checking or shell commands).
 * Version checking is deferred to `runInstallStep`.
 */
const resolveInstallPlan = (cwd: string) =>
  detectCoreDependencyPlan(cwd).pipe(Effect.catchAll(() => Effect.succeed(null)));

/**
 * Runs the interactive init wizard.
 *
 * Steps:
 * 1. Usage mode — "Native tools" or "Composio MCP"
 * 2. Framework — which agent framework (only if native)
 * 3. Install skills — whether to install Composio coding-agent skills
 * 4. Detect project environment (only if native)
 * 5. Resolve install plan (only if native and environment detected)
 *
 * All inputs are collected through the builder before any side effects run.
 * Confirmation of the install plan is deferred to a unified prompt later.
 * Returns a fully-built `InitConfig`.
 */
const runInitWizard = (cwd: string, params: { noSkills: boolean }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;

    // Step 1: Usage mode
    const usageMode = yield* ui.select<UsageMode>(
      'How would you like to use Composio?',
      USAGE_MODE_OPTIONS
    );

    // Step 2: Frameworks (only for native tools, multi-select)
    const frameworks: NativeFramework[] =
      usageMode === 'native'
        ? yield* ui.multiSelect<NativeFramework>(
            'Which frameworks do you use?',
            NATIVE_FRAMEWORK_OPTIONS
          )
        : [];

    // Step 3: Install Composio skills (skip prompt when --no-skills)
    const installSkills = params.noSkills
      ? false
      : yield* ui.confirm('Install Composio skills for your Coding Agent?', {
          defaultValue: true,
        });

    // Steps 4+5: Detect environment + resolve install plan (only for native tools)
    let detectedEnv: ProjectEnvironment | undefined;
    let installPlan: CoreDependencyPlan | undefined;

    if (usageMode === 'native') {
      // Step 4: Detect project environment
      detectedEnv = yield* detectEnvironment(cwd);

      // Step 5: Resolve install plan (confirmation deferred to unified prompt)
      if (detectedEnv) {
        const plan = yield* resolveInstallPlan(cwd);
        if (plan) {
          installPlan = plan;
        }
      }
    }

    return InitConfigBuilder.create()
      .withUsageMode(usageMode)
      .withFrameworks(frameworks)
      .withInstallSkills(installSkills)
      .withDetectedEnv(detectedEnv)
      .withInstallPlan(installPlan)
      .build();
  });

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

/**
 * Serializes an `InitConfig` to the JSON payload written to `.composio/config.json`.
 */
const initConfigToJSON = (config: InitConfig): string => {
  const payload: Record<string, unknown> = {
    usage_mode: config.usageMode,
  };
  if (config.frameworks.length > 0) {
    payload.frameworks = config.frameworks;
  }
  payload.install_skills = config.installSkills;
  if (config.detectedEnv) {
    payload.detected_language = config.detectedEnv.language;
    payload.package_manager = config.detectedEnv.packageManager;
  }
  return JSON.stringify(payload, null, 2);
};

/** Writes project keys + init config to `<cwd>/.composio/` and creates a `.gitignore`. */
const writeProjectConfig = (composioDir: string, selected: ProjectKeys, config?: InitConfig) =>
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

    if (config) {
      yield* fs.writeFileString(path.join(composioDir, 'config.json'), initConfigToJSON(config));
    }

    // Create .composio/.gitignore to prevent accidental commits
    const gitignorePath = path.join(composioDir, '.gitignore');
    const gitignoreExists = yield* fs.exists(gitignorePath);
    if (!gitignoreExists) {
      yield* fs.writeFileString(gitignorePath, '*\n');
    }
  });

// ---------------------------------------------------------------------------
// Install step — runs after wizard, before outro
// ---------------------------------------------------------------------------

/**
 * Runs the dependency installation step based on the init config.
 * Handles --dry-run, --force flags and already-installed detection.
 * Confirmation is handled by the caller (`printEnvVarsAndInstall`).
 */
const runInstallStep = (params: {
  config: InitConfig;
  cwd: string;
  dryRun: boolean;
  force: boolean;
}) =>
  Effect.gen(function* () {
    const { config, cwd, dryRun, force } = params;
    if (!config.installPlan) return;

    const ui = yield* TerminalUI;
    const runner = yield* CommandRunner;
    const plan = config.installPlan;

    // Check if already installed (only for JS — Python version check requires shell)
    if (plan.kind === 'js') {
      const depState = yield* resolveCoreDependencyState(cwd).pipe(
        Effect.catchAll(() => Effect.succeed({ plan, installedVersion: null }))
      );

      if (depState.installedVersion && !force) {
        const detail =
          depState.installedVersion.source === 'package.json'
            ? `declared in package.json (${depState.installedVersion.version})`
            : `${depState.installedVersion.version} (${depState.installedVersion.source})`;
        yield* ui.log.info(`Found ${plan.dependency}: ${detail}`);
        yield* ui.log.success('Dependency already installed.');
        return;
      }

      if (depState.installedVersion && force) {
        yield* ui.log.warn('Reinstalling due to --force.');
      }
    }

    if (dryRun) {
      yield* ui.note(plan.installCommand, 'Install Command');
      yield* ui.log.info('Dry run complete.');
      return;
    }

    const [cmd, ...args] = plan.installCommand.split(' ');
    const command = PlatformCommand.make(cmd!, ...args).pipe(
      PlatformCommand.workingDirectory(plan.rootDir)
    );

    const install = Effect.gen(function* () {
      const exitCode = yield* runner.run(command);
      if (exitCode !== 0) {
        yield* Effect.fail(new Error(`Install command failed with exit code ${exitCode}`));
      }
    });

    yield* ui
      .withSpinner(`Installing ${plan.dependency}...`, install, {
        successMessage: `Installed ${plan.dependency}.`,
        errorMessage: `Failed to install ${plan.dependency}.`,
      })
      .pipe(
        Effect.catchAll(e =>
          Effect.gen(function* () {
            yield* ui.log.error(`Install failed: ${e instanceof Error ? e.message : String(e)}`);
            yield* ui.log.info(`You can install manually: ${plan.installCommand}`);
          })
        )
      );
  });

// ---------------------------------------------------------------------------
// Skills install step — inline installation from composiohq/skills
// ---------------------------------------------------------------------------

/**
 * Runs the Composio skills installation step.
 * Clones composiohq/skills, discovers skills, prompts for agents/scope/method,
 * shows summary, confirms, and installs.
 */
const runSkillsInstallStep = (params: {
  config: InitConfig;
  cwd: string;
  dryRun: boolean;
  yes: boolean;
}) =>
  Effect.gen(function* () {
    const { config, cwd, dryRun, yes } = params;
    if (!config.installSkills) return;

    const ui = yield* TerminalUI;

    // 1. Clone composiohq/skills to temp dir
    let tempDir: string;
    try {
      tempDir = yield* ui.withSpinner(
        'Cloning Composio skills repository...',
        Effect.tryPromise(() => cloneSkillsRepo()),
        { successMessage: 'Skills repository cloned' }
      );
    } catch (e) {
      yield* ui.log.error(
        `Failed to clone skills repository: ${e instanceof Error ? e.message : String(e)}`
      );
      yield* ui.log.info(`You can install skills manually: ${SKILLS_MANUAL_COMMAND}`);
      return;
    }

    const doInstall = Effect.gen(function* () {
      // 2. Discover skills
      const skills = yield* ui.withSpinner(
        'Discovering skills...',
        Effect.tryPromise(() => discoverSkills(tempDir)),
        { successMessage: (s: Skill[]) => `Found ${s.length} skill${s.length !== 1 ? 's' : ''}` }
      );

      if (skills.length === 0) {
        yield* ui.log.warn('No skills found in composiohq/skills.');
        return;
      }

      // 3. Detect installed agents
      const installedAgents = yield* Effect.tryPromise(() => detectInstalledAgents());

      // 4. Agent selection
      let targetAgents: AgentType[];
      if (yes) {
        targetAgents = ensureUniversalAgents(
          installedAgents.length > 0 ? installedAgents : (Object.keys(agents) as AgentType[])
        );
        yield* ui.log.info(
          `Installing to: ${targetAgents.map(a => agents[a].displayName).join(', ')}`
        );
      } else {
        const selected = yield* Effect.tryPromise(() => selectAgentsInteractive({ global: false }));
        if (selected === cancelSymbol) {
          yield* ui.log.warn('Skills installation cancelled.');
          return;
        }
        targetAgents = selected as AgentType[];
      }

      // 5. Scope selection
      let installGlobally: boolean;
      if (yes) {
        installGlobally = false;
      } else {
        installGlobally = yield* ui.select<boolean>('Installation scope', [
          {
            value: false,
            label: 'Project',
            hint: 'Install in current directory (committed with your project)',
          },
          {
            value: true,
            label: 'Global',
            hint: 'Install in home directory (available across all projects)',
          },
        ]);
      }

      // 6. Method selection
      let installMode: InstallMode;
      if (yes) {
        installMode = 'symlink';
      } else {
        installMode = yield* ui.select<InstallMode>('Installation method', [
          {
            value: 'symlink',
            label: 'Symlink (Recommended)',
            hint: 'Single source of truth, easy updates',
          },
          {
            value: 'copy',
            label: 'Copy to all agents',
            hint: 'Independent copies for each agent',
          },
        ]);
      }

      // 7. Check for overwrites + build summary
      const overwriteStatus = yield* Effect.tryPromise(() =>
        checkOverwrites(skills, targetAgents, { global: installGlobally })
      );

      const summaryLines = buildInstallationSummary(
        skills,
        targetAgents,
        installMode,
        installGlobally,
        cwd,
        overwriteStatus
      );
      yield* ui.note(summaryLines.join('\n'), 'Installation Summary');

      // 8. Dry run — show summary and exit
      if (dryRun) {
        yield* ui.log.info('Dry run — no changes made.');
        return;
      }

      // 9. Confirm
      const confirmed =
        yes || (yield* ui.confirm('Proceed with installation?', { defaultValue: true }));
      if (!confirmed) {
        yield* ui.log.warn('Skills installation cancelled.');
        return;
      }

      // 10. Install skills
      const results = yield* ui.withSpinner(
        'Installing skills...',
        Effect.tryPromise(() =>
          installAllSkills(skills, targetAgents, {
            global: installGlobally,
            mode: installMode,
            cwd,
          })
        ),
        {
          successMessage: 'Installation complete',
          errorMessage: 'Failed to install skills',
        }
      );

      // 11. Display results
      const display = buildInstallationResultDisplay(results, targetAgents, cwd);

      if (display.resultNoteLines.length > 0) {
        yield* ui.note(display.resultNoteLines.join('\n'), display.resultNoteTitle);
      }
      if (display.symlinkWarning) {
        yield* ui.log.warn(`Symlinks failed for: ${formatList(display.symlinkWarning.agents)}`);
        yield* ui.log.message(
          '  Files were copied instead. On Windows, enable Developer Mode for symlink support.'
        );
      }
      for (const line of display.failedLines) {
        yield* ui.log.error(line);
      }
    });

    yield* Effect.ensuring(
      doInstall.pipe(
        Effect.catchAll(e =>
          Effect.gen(function* () {
            yield* ui.log.error(
              `Skills install failed: ${e instanceof Error ? e.message : String(e)}`
            );
            yield* ui.log.info(`You can install manually: ${SKILLS_MANUAL_COMMAND}`);
          })
        )
      ),
      Effect.tryPromise(() => cleanupTempDir(tempDir)).pipe(Effect.catchAll(() => Effect.void))
    );
  });

// ---------------------------------------------------------------------------
// Unified install confirmation — shows env vars, summary, then installs
// ---------------------------------------------------------------------------

/**
 * Prints env vars (if available), shows an install summary, asks for a single
 * confirmation, and runs both install steps. Skips the prompt entirely when
 * there is nothing to install (no install plan AND no skills).
 */
const printEnvVarsAndInstall = (params: {
  config: InitConfig;
  envVars: ResolvedEnvVars | null;
  cwd: string;
  dryRun: boolean;
  force: boolean;
  yes: boolean;
}) =>
  Effect.gen(function* () {
    const { config, envVars, cwd, dryRun, force, yes } = params;
    const ui = yield* TerminalUI;

    const hasWork = !!config.installPlan || config.installSkills;

    // Always print env vars if available
    if (envVars) {
      yield* printEnvVars(envVars);
    }

    // Nothing to install — skip the confirmation prompt entirely
    if (!hasWork) return;

    // For non-dry-run: show install summary and ask for confirmation (dep install only)
    if (!dryRun && config.installPlan) {
      yield* ui.note(config.installPlan.installCommand, 'Install commands');

      if (!yes) {
        const confirmed = yield* ui.confirm('Proceed with installation?', { defaultValue: true });
        if (!confirmed) {
          yield* ui.log.warn('Installation cancelled.');
          return;
        }
      }
    }

    // Run install steps (dry-run is handled internally by each step)
    yield* runInstallStep({ config, cwd, dryRun, force });
    // Skills step has its own interactive prompts (agents, scope, method, confirm)
    yield* runSkillsInstallStep({ config, cwd, dryRun, yes });
  });

// ---------------------------------------------------------------------------
// Structured output helper
// ---------------------------------------------------------------------------

/** Resolved credentials to be printed and included in structured output. */
interface ResolvedEnvVars {
  readonly composioApiKey: string | null;
  readonly composioTestUserId: string;
}

const makeOutputJson = (
  selected: ProjectKeys,
  config: InitConfig,
  composioDir: string,
  envVars?: ResolvedEnvVars | null
) =>
  JSON.stringify({
    org_id: selected.orgId,
    project_id: selected.projectId,
    usage_mode: config.usageMode,
    frameworks: config.frameworks,
    install_skills: config.installSkills,
    detected_language: config.detectedEnv?.language ?? null,
    package_manager: config.detectedEnv?.packageManager ?? null,
    install_command: config.installPlan?.installCommand ?? null,
    path: composioDir,
    ...(envVars?.composioApiKey ? { composio_api_key: envVars.composioApiKey } : {}),
    ...(envVars ? { composio_test_user_id: envVars.composioTestUserId } : {}),
  });

// ---------------------------------------------------------------------------
// Global user API key + env var helpers (from recent improvements)
// ---------------------------------------------------------------------------

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

const resolveProjectEnvVars = (params: { selected: ProjectKeys }) =>
  Effect.gen(function* () {
    const { selected } = params;
    const ctx = yield* ComposioUserContext;

    const uakApiKey = yield* getGlobalUserApiKey();
    if (!uakApiKey) {
      return null;
    }

    const sessionInfo = yield* getSessionInfo({
      baseURL: ctx.data.baseURL,
      apiKey: uakApiKey,
      orgId: selected.orgId,
      projectId: selected.projectId,
    });

    let projectApiKey = sessionInfo.api_key?.api_key ?? sessionInfo.api_key?.key ?? null;
    if (!projectApiKey) {
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

    return { composioApiKey: projectApiKey, composioTestUserId };
  });

const printEnvVars = (envVars: ResolvedEnvVars) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;

    const redactedLines: string[] = [];
    if (envVars.composioApiKey) {
      redactedLines.push(
        `COMPOSIO_API_KEY=${redact({ value: envVars.composioApiKey, prefix: 'ak_' })}`
      );
    }
    redactedLines.push(
      `COMPOSIO_TEST_USER_ID=${redact({ value: envVars.composioTestUserId, prefix: 'pr_' })}`
    );

    yield* ui.note(redactedLines.join('\n'), 'Environment variables');
  });

const logEnvCreationHttpError =
  (ui: TerminalUI) =>
  (e: { status?: number; details?: { message: string; suggestedFix: string }; cause?: unknown }) =>
    Effect.gen(function* () {
      yield* ui.log.warn('Could not resolve environment variables from session info.');
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
    yield* ui.log.warn('Could not decode API key response; skipping environment variable display.');
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
 * Creates `<cwd>/.composio/project.json` with org_id and project_id,
 * plus `<cwd>/.composio/config.json` with usage mode, framework, and skill preferences.
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
    dryRun: dryRunOpt,
    force: forceOpt,
    yes: yesOpt,
    noSkills: noSkillsOpt,
  },
  ({ orgId, projectId, noBrowser, dryRun, force, yes, noSkills }) =>
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

        const config = yield* runInitWizard(proc.cwd, { noSkills });
        yield* writeProjectConfig(composioDir, selected, config);

        const envVars = yield* resolveProjectEnvVars({ selected }).pipe(
          Effect.catchTag('services/HttpServerError', e =>
            Effect.gen(function* () {
              yield* Effect.logDebug('Failed to resolve project API key from session/info:', e);
              yield* logEnvCreationHttpError(ui)(e);
              return null;
            })
          ),
          Effect.catchTag('services/HttpDecodingError', e =>
            Effect.gen(function* () {
              yield* Effect.logDebug('Failed to decode API key response:', e);
              yield* logEnvCreationDecodingError(ui)(e);
              return null;
            })
          )
        );

        if (envVars) {
          yield* writeProjectConfig(
            composioDir,
            { ...selected, testUserId: Option.some(envVars.composioTestUserId) },
            config
          );
        }

        yield* printEnvVarsAndInstall({ config, envVars, cwd: proc.cwd, dryRun, force, yes });

        yield* ui.log.success(`Project initialized in ${composioDir}/`);
        yield* ui.output(makeOutputJson(selected, config, composioDir, envVars));
        yield* ui.outro('');
        return;
      }

      yield* initInteractiveFlow({ composioDir, noBrowser, dryRun, force, yes, noSkills });
    })
).pipe(CliCommand.withDescription('Initialize a Composio project in the current directory.'));

/**
 * Interactive init flow — handles login, project selection, wizard, install.
 * Extracted to keep the main command handler under the line limit.
 */
const initInteractiveFlow = (params: {
  composioDir: string;
  noBrowser: boolean;
  dryRun: boolean;
  force: boolean;
  yes: boolean;
  noSkills: boolean;
}) =>
  Effect.gen(function* () {
    const { composioDir, noBrowser, dryRun, force, yes, noSkills } = params;
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

    // 4. Run wizard + write config + install
    const config = yield* runInitWizard(proc.cwd, { noSkills });
    yield* writeProjectConfig(composioDir, selected, config);

    const envVars = yield* resolveProjectEnvVars({ selected }).pipe(
      Effect.catchTag('services/HttpServerError', e =>
        Effect.gen(function* () {
          yield* Effect.logDebug('Failed to resolve project API key from session/info:', e);
          yield* logEnvCreationHttpError(ui)(e);
          return null;
        })
      ),
      Effect.catchTag('services/HttpDecodingError', e =>
        Effect.gen(function* () {
          yield* Effect.logDebug('Failed to decode API key response:', e);
          yield* logEnvCreationDecodingError(ui)(e);
          return null;
        })
      )
    );

    if (envVars) {
      yield* writeProjectConfig(
        composioDir,
        { ...selected, testUserId: Option.some(envVars.composioTestUserId) },
        config
      );
    }

    yield* printEnvVarsAndInstall({ config, envVars, cwd: proc.cwd, dryRun, force, yes });

    yield* ui.log.success(`Project initialized in ${composioDir}/`);
    yield* ui.output(makeOutputJson(selected, config, composioDir, envVars));
    yield* ui.outro('');
  });
