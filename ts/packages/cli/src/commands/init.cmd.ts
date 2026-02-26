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
  checkOverwrites,
  installAllSkills,
  buildInstallationResultDisplay,
  formatList,
} from 'src/skills';

/**
 * `composio init` — Initialize a Composio project in the current directory.
 *
 * ## Workflow (4 phases)
 *
 * ### Phase 1: COLLECT (interactive, no writes)
 * 1. Login (if needed) + project selection
 * 2. Usage mode — "Native tools" vs "Composio MCP"
 * 3. Framework — which agent framework (if native)
 * 4. Skills — whether to install, agent selection, scope, method
 * 5. Environment detection + dependency plan (if native)
 *
 * ### Phase 2: CONFIRM
 * 6. Unified summary of everything to install
 * 7. Single confirmation prompt
 *
 * ### Phase 3: EXECUTE
 * 8. Resolve API keys (lazy network call)
 * 9. Write `.composio/project.json`, `config.json`, `.env.local`
 * 10. Install dependencies + skills
 *
 * ### Phase 4: OUTRO (always runs, even on partial failure)
 * 11. Show API keys
 * 12. Show manual commands for any failed installs
 * 13. Success message
 *
 * ## Flags
 *
 * - `--dry-run` — show summary without executing
 * - `--force` — reinstall even if dependency is already present
 * - `--yes` / `-y` — bypass all prompts with sensible defaults
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
  Options.withDescription(
    'Skip all prompts, use defaults (native mode, all frameworks, install skills)'
  )
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
// SkillsConfig — collected during Phase 1, executed in Phase 3
// ---------------------------------------------------------------------------

interface SkillsConfig {
  readonly tempDir: string;
  readonly skills: Skill[];
  readonly targetAgents: AgentType[];
  readonly installGlobally: boolean;
  readonly installMode: InstallMode;
  readonly overwriteStatus: Map<string, Map<string, boolean>>;
}

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

  withSkillsConfig(
    sc: SkillsConfig | undefined
  ): InitConfigBuilder<T & { skillsConfig: SkillsConfig | undefined }> {
    return new InitConfigBuilder({ ...this.data, skillsConfig: sc });
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
      skillsConfig: SkillsConfig | undefined;
      detectedEnv: ProjectEnvironment | undefined;
      installPlan: CoreDependencyPlan | undefined;
    }>
  ): InitConfig {
    return {
      usageMode: this.data.usageMode,
      frameworks: this.data.frameworks,
      skillsConfig: this.data.skillsConfig,
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
  readonly skillsConfig: SkillsConfig | undefined;
  readonly detectedEnv: ProjectEnvironment | undefined;
  readonly installPlan: CoreDependencyPlan | undefined;
}

// ---------------------------------------------------------------------------
// Phase 1: COLLECT — all interactive, no writes
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

/** Best-effort cleanup of a temp directory. */
const safeCleanupTempDir = (dir: string) =>
  Effect.tryPromise(() => cleanupTempDir(dir)).pipe(Effect.catchAll(() => Effect.void));

/**
 * Collects skills configuration interactively: clone repo, discover skills,
 * prompt for agents, scope, and method. Returns `undefined` if the user cancels
 * or if cloning/discovery fails.
 *
 * The cloned temp directory is registered with the current Effect `Scope` via
 * `acquireRelease` — it is automatically cleaned up when the scope closes
 * (on success, failure, cancellation, or interruption). Callers must wrap
 * this in `Effect.scoped` to provide the scope.
 */
const collectSkillsConfig = (params: { yes: boolean }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const { yes } = params;

    // 1. Clone composiohq/skills to temp dir (scoped — auto-cleaned when scope closes)
    const tempDir = yield* Effect.acquireRelease(
      ui.withSpinner(
        'Cloning Composio skills repository...',
        Effect.tryPromise(() => cloneSkillsRepo()),
        { successMessage: 'Skills repository cloned' }
      ),
      dir => safeCleanupTempDir(dir)
    ).pipe(
      Effect.catchAll(e =>
        Effect.gen(function* () {
          yield* ui.log.error(
            `Failed to clone skills repository: ${e instanceof Error ? e.message : String(e)}`
          );
          yield* ui.log.info(`You can install skills manually: ${SKILLS_MANUAL_COMMAND}`);
          return undefined as string | undefined;
        })
      )
    );
    if (!tempDir) return undefined;

    // 2. Discover skills
    const skills = yield* ui
      .withSpinner(
        'Discovering skills...',
        Effect.tryPromise(() => discoverSkills(tempDir)),
        { successMessage: (s: Skill[]) => `Found ${s.length} skill${s.length !== 1 ? 's' : ''}` }
      )
      .pipe(
        Effect.catchAll(e =>
          Effect.gen(function* () {
            yield* ui.log.error(
              `Failed to discover skills: ${e instanceof Error ? e.message : String(e)}`
            );
            return undefined as Skill[] | undefined;
          })
        )
      );
    if (!skills) return undefined;

    if (skills.length === 0) {
      yield* ui.log.warn('No skills found in composiohq/skills.');
      return undefined;
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
      const agentResult = yield* Effect.tryPromise(() =>
        selectAgentsInteractive({ global: false })
      );
      if (!Array.isArray(agentResult)) {
        yield* ui.log.warn('Skills installation cancelled.');
        return undefined;
      }
      targetAgents = agentResult;
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

    // 7. Check for overwrites
    const overwriteStatus = yield* Effect.tryPromise(() =>
      checkOverwrites(skills, targetAgents, { global: installGlobally })
    );

    return {
      tempDir,
      skills,
      targetAgents,
      installGlobally,
      installMode,
      overwriteStatus,
    } satisfies SkillsConfig;
  });

/**
 * Runs the interactive init wizard (Phase 1).
 *
 * Steps:
 * 1. Usage mode — "Native tools" or "Composio MCP"
 * 2. Framework — which agent framework (only if native)
 * 3. Skills — yes/no, then agent selection, scope, method (if yes)
 * 4. Detect project environment (only if native)
 * 5. Resolve install plan (only if native and environment detected)
 *
 * All inputs are collected before any writes happen.
 * Returns a fully-built `InitConfig`.
 */
const runInitWizard = (cwd: string, params: { noSkills: boolean; yes: boolean }) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;

    // Step 1: Usage mode
    const usageMode: UsageMode = params.yes
      ? 'native'
      : yield* ui.select<UsageMode>('How would you like to use Composio?', USAGE_MODE_OPTIONS);

    // Step 2: Frameworks (only for native tools, multi-select)
    const frameworks: NativeFramework[] =
      usageMode === 'native'
        ? params.yes
          ? NATIVE_FRAMEWORK_OPTIONS.map(o => o.value)
          : yield* ui.multiSelect<NativeFramework>(
              'Which frameworks do you use?',
              NATIVE_FRAMEWORK_OPTIONS
            )
        : [];

    // Step 3: Skills sub-wizard (skip entirely when --no-skills)
    let skillsConfig: SkillsConfig | undefined;
    if (!params.noSkills) {
      const wantSkills = params.yes
        ? true
        : yield* ui.confirm('Install Composio skills for your Coding Agent?', {
            defaultValue: true,
          });
      if (wantSkills) {
        skillsConfig = yield* collectSkillsConfig({ yes: params.yes });
      }
    }

    // Steps 4+5: Detect environment + resolve install plan (only for native tools)
    let detectedEnv: ProjectEnvironment | undefined;
    let installPlan: CoreDependencyPlan | undefined;

    if (usageMode === 'native') {
      // Step 4: Detect project environment
      detectedEnv = yield* detectEnvironment(cwd);

      // Step 5: Resolve install plan
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
      .withSkillsConfig(skillsConfig)
      .withDetectedEnv(detectedEnv)
      .withInstallPlan(installPlan)
      .build();
  });

// ---------------------------------------------------------------------------
// Phase 2: CONFIRM — unified summary
// ---------------------------------------------------------------------------

/**
 * Builds a human-readable summary of everything that will be installed.
 */
const buildUnifiedSummary = (projectName: string, config: InitConfig): string => {
  const lines: string[] = [];

  lines.push(`Project: ${projectName}`);
  lines.push(`Usage mode: ${config.usageMode === 'native' ? 'Native tools' : 'Composio MCP'}`);

  if (config.frameworks.length > 0) {
    const fwLabels = config.frameworks.map(
      fw => NATIVE_FRAMEWORK_OPTIONS.find(o => o.value === fw)?.label ?? fw
    );
    lines.push(`Frameworks: ${fwLabels.join(', ')}`);
  }

  if (config.skillsConfig) {
    const { skills, targetAgents, installGlobally, installMode, overwriteStatus } =
      config.skillsConfig;
    lines.push('');
    lines.push(`Skills: ${skills.length} skill${skills.length !== 1 ? 's' : ''}`);
    lines.push(`  Agents: ${formatList(targetAgents.map(a => agents[a].displayName))}`);
    lines.push(`  Scope: ${installGlobally ? 'Global' : 'Project'}`);
    lines.push(`  Method: ${installMode === 'symlink' ? 'Symlink' : 'Copy'}`);

    // Count overwrites
    let overwriteCount = 0;
    for (const [, agentMap] of overwriteStatus) {
      for (const [, willOverwrite] of agentMap) {
        if (willOverwrite) overwriteCount++;
      }
    }
    if (overwriteCount > 0) {
      lines.push(
        `  Overwrites: ${overwriteCount} existing skill${overwriteCount !== 1 ? 's' : ''}`
      );
    }
  }

  if (config.installPlan) {
    lines.push('');
    lines.push(`Dependencies: ${config.installPlan.installCommand}`);
  }

  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

interface InitConfigPayload {
  usage_mode: UsageMode;
  frameworks?: NativeFramework[];
  install_skills: boolean;
  detected_language?: string;
  package_manager?: string;
}

/**
 * Serializes an `InitConfig` to the JSON payload written to `.composio/config.json`.
 */
const initConfigToJSON = (config: InitConfig): string => {
  const payload: InitConfigPayload = {
    usage_mode: config.usageMode,
    install_skills: !!config.skillsConfig,
  };
  if (config.frameworks.length > 0) {
    payload.frameworks = config.frameworks;
  }
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

/** Writes environment variables to `.composio/.env.local`. */
const writeEnvLocal = (composioDir: string, envVars: ResolvedEnvVars) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const lines: string[] = ['# Generated by `composio init` — do not commit'];
    if (envVars.composioApiKey) {
      lines.push(`COMPOSIO_API_KEY=${envVars.composioApiKey}`);
    }
    lines.push(`COMPOSIO_TEST_USER_ID=${envVars.composioTestUserId}`);
    lines.push(''); // trailing newline
    const envLocalPath = path.join(composioDir, '.env.local');
    yield* fs.writeFileString(envLocalPath, lines.join('\n'));
    yield* fs.chmod(envLocalPath, 0o600);
  });

// ---------------------------------------------------------------------------
// Phase 3: EXECUTE — install deps + skills, write config
// ---------------------------------------------------------------------------

/** Tracks what succeeded and failed during Phase 3. */
interface ExecutionOutcome {
  envVars: ResolvedEnvVars | null;
  depInstallOk: boolean;
  skillsInstallOk: boolean;
}

/**
 * Runs the dependency installation step.
 * Handles --force and already-installed detection.
 * Returns `true` on success, `false` on failure.
 */
const runInstallStep = (params: { config: InitConfig; cwd: string; force: boolean }) =>
  Effect.gen(function* () {
    const { config, cwd, force } = params;
    if (!config.installPlan) return true;

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
        return true;
      }

      if (depState.installedVersion && force) {
        yield* ui.log.warn('Reinstalling due to --force.');
      }
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

    return yield* ui
      .withSpinner(`Installing ${plan.dependency}...`, install, {
        successMessage: `Installed ${plan.dependency}.`,
        errorMessage: `Failed to install ${plan.dependency}.`,
      })
      .pipe(
        Effect.map(() => true),
        Effect.catchAll(e =>
          Effect.gen(function* () {
            yield* ui.log.error(`Install failed: ${e instanceof Error ? e.message : String(e)}`);
            return false;
          })
        )
      );
  });

/**
 * Executes the skills installation (no interactive prompts — config is pre-collected).
 * Returns `true` on success, `false` on failure.
 */
const runSkillsExecuteStep = (params: { skillsConfig: SkillsConfig; cwd: string }) =>
  Effect.gen(function* () {
    const { skillsConfig, cwd } = params;
    const ui = yield* TerminalUI;

    const results = yield* ui.withSpinner(
      'Installing skills...',
      Effect.tryPromise(() =>
        installAllSkills(skillsConfig.skills, skillsConfig.targetAgents, {
          global: skillsConfig.installGlobally,
          mode: skillsConfig.installMode,
          cwd,
        })
      ),
      {
        successMessage: 'Skills installation complete',
        errorMessage: 'Failed to install skills',
      }
    );

    // Display results
    const display = buildInstallationResultDisplay(results, skillsConfig.targetAgents, cwd);

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

    return display.failedLines.length === 0;
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
    install_skills: !!config.skillsConfig,
    detected_language: config.detectedEnv?.language ?? null,
    package_manager: config.detectedEnv?.packageManager ?? null,
    install_command: config.installPlan?.installCommand ?? null,
    path: composioDir,
    ...(envVars?.composioApiKey ? { composio_api_key: envVars.composioApiKey } : {}),
    ...(envVars ? { composio_test_user_id: envVars.composioTestUserId } : {}),
  });

// ---------------------------------------------------------------------------
// Global user API key + env var helpers
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
// Phases 2-4: Confirm → Execute → Outro
// ---------------------------------------------------------------------------

/**
 * Runs Phases 2-4 of the init workflow:
 * - Phase 2: Show unified summary + single confirmation
 * - Phase 3: Resolve API keys, write config, install deps + skills
 * - Phase 4: Always show API keys + manual commands for failed installs
 *
 * Cancel at confirmation = exit cleanly, nothing written.
 */
const runConfirmExecuteOutro = (params: {
  selected: ProjectKeys;
  projectDisplayName: string;
  config: InitConfig;
  composioDir: string;
  cwd: string;
  dryRun: boolean;
  force: boolean;
  yes: boolean;
}) =>
  Effect.gen(function* () {
    const { selected, projectDisplayName, config, composioDir, cwd, dryRun, force, yes } = params;
    const ui = yield* TerminalUI;

    const hasWork = !!config.installPlan || !!config.skillsConfig;

    // ── Phase 2: CONFIRM ──────────────────────────────────────────────

    if (hasWork) {
      const summary = buildUnifiedSummary(projectDisplayName, config);
      yield* ui.note(summary, 'Installation Summary');

      // Dry run: show summary and exit without writing anything
      if (dryRun) {
        yield* ui.log.info('Dry run complete — no changes made.');
        yield* ui.outro('');
        return;
      }

      // Confirm (skip when --yes)
      if (!yes) {
        const confirmed = yield* ui.confirm('Proceed with installation?', { defaultValue: true });
        if (!confirmed) {
          yield* ui.log.warn('Installation cancelled.');
          yield* ui.outro('');
          return;
        }
      }
    }

    // ── Phase 3: EXECUTE ──────────────────────────────────────────────

    // Pessimistic defaults — flipped to true only on success.
    // This ensures the safety net catchAll never masks failures as successes.
    const outcome: ExecutionOutcome = {
      envVars: null,
      depInstallOk: !config.installPlan,
      skillsInstallOk: !config.skillsConfig,
    };

    // Skills tempDir cleanup is handled by Effect.acquireRelease in collectSkillsConfig —
    // it runs automatically when the surrounding Effect.scoped closes.

    yield* Effect.gen(function* () {
      // Step 6: Resolve API keys (lazy — first network call after confirmation)
      outcome.envVars = yield* resolveProjectEnvVars({ selected }).pipe(
        Effect.catchTag('services/HttpServerError', e =>
          Effect.gen(function* () {
            yield* Effect.logDebug('Failed to resolve project API key:', e);
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

      // Step 7: Write project config (once, with testUserId if available)
      const projectKeys = outcome.envVars
        ? { ...selected, testUserId: Option.some(outcome.envVars.composioTestUserId) }
        : selected;
      yield* writeProjectConfig(composioDir, projectKeys, config);

      // Step 8: Write .composio/.env.local
      if (outcome.envVars) {
        yield* writeEnvLocal(composioDir, outcome.envVars);
      }

      // Step 9: Install dependencies
      if (config.installPlan) {
        outcome.depInstallOk = yield* runInstallStep({ config, cwd, force }).pipe(
          Effect.catchAll(() => Effect.succeed(false))
        );
      }

      // Step 10: Install skills
      if (config.skillsConfig) {
        outcome.skillsInstallOk = yield* runSkillsExecuteStep({
          skillsConfig: config.skillsConfig,
          cwd,
        }).pipe(
          Effect.catchAll(e =>
            Effect.gen(function* () {
              yield* ui.log.error(
                `Skills install failed: ${e instanceof Error ? e.message : String(e)}`
              );
              return false;
            })
          )
        );
      }
    }).pipe(
      // Safety net: log if anything unexpected escapes individual error handling
      Effect.catchAll(e =>
        Effect.logWarning(
          `Unexpected error during init execution: ${e instanceof Error ? e.message : String(e)}`
        )
      )
    );

    // ── Phase 4: OUTRO (always runs) ──────────────────────────────────

    // Step 11: Show API keys
    if (outcome.envVars) {
      const envLines: string[] = [];
      if (outcome.envVars.composioApiKey) {
        envLines.push(
          `COMPOSIO_API_KEY=${redact({ value: outcome.envVars.composioApiKey, prefix: 'ak_' })}`
        );
      }
      envLines.push(
        `COMPOSIO_TEST_USER_ID=${redact({ value: outcome.envVars.composioTestUserId, prefix: 'pr_' })}`
      );
      envLines.push('');
      envLines.push(`Saved to ${composioDir}/.env.local`);
      yield* ui.note(envLines.join('\n'), 'Environment variables');
    }

    // Step 12: If dep install failed → show manual command
    if (!outcome.depInstallOk && config.installPlan) {
      yield* ui.log.warn('Dependency installation failed. Install manually:');
      yield* ui.log.message(`  ${config.installPlan.installCommand}`);
    }

    // Step 13: If skills install failed → show manual command
    if (!outcome.skillsInstallOk) {
      yield* ui.log.warn('Skills installation failed. Install manually:');
      yield* ui.log.message(`  ${SKILLS_MANUAL_COMMAND}`);
    }

    // Step 14: Success
    yield* ui.log.success(`Project initialized in ${composioDir}/`);
    yield* ui.output(makeOutputJson(selected, config, composioDir, outcome.envVars));
    yield* ui.outro('');
  });

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * CLI command to initialize a Composio project in the current directory.
 *
 * Creates `<cwd>/.composio/project.json` with org_id and project_id,
 * plus `<cwd>/.composio/config.json` with usage mode, framework, and skill preferences,
 * and `<cwd>/.composio/.env.local` with API keys.
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

        // Scope manages the skills tempDir lifetime (acquireRelease in collectSkillsConfig)
        yield* Effect.scoped(
          Effect.gen(function* () {
            const config = yield* runInitWizard(proc.cwd, { noSkills, yes });
            yield* runConfirmExecuteOutro({
              selected,
              projectDisplayName: projectId.value,
              config,
              composioDir,
              cwd: proc.cwd,
              dryRun,
              force,
              yes,
            });
          })
        );
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

    // Scope manages the skills tempDir lifetime (acquireRelease in collectSkillsConfig)
    yield* Effect.scoped(
      Effect.gen(function* () {
        const config = yield* runInitWizard(proc.cwd, { noSkills, yes });
        yield* runConfirmExecuteOutro({
          selected,
          projectDisplayName: selectedProject.name,
          config,
          composioDir,
          cwd: proc.cwd,
          dryRun,
          force,
          yes,
        });
      })
    );
  });
