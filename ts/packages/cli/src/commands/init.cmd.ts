import path from 'node:path';
import { Command as CliCommand, Options } from '@effect/cli';
import { Command as PlatformCommand } from '@effect/platform';
import { Effect, Option } from 'effect';
import { FileSystem } from '@effect/platform';
import { ComposioUserContext } from 'src/services/user-context';
import { NodeProcess } from 'src/services/node-process';
import { projectKeysToJSON, type ProjectKeys } from 'src/models/project-keys';
import { listOrgProjects, type OrgProject } from 'src/services/composio-clients';
import * as constants from 'src/constants';
import { TerminalUI } from 'src/services/terminal-ui';
import { browserLogin, noBrowser as noBrowserOpt } from 'src/commands/login.cmd';
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
 * - `--yes` / `-y` — skip confirmation prompts
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
  Options.withDescription('Skip confirmation prompts')
);

const noSkillsOpt = Options.boolean('no-skills').pipe(
  Options.withDefault(false),
  Options.withDescription('Skip Composio skills installation')
);

// ---------------------------------------------------------------------------
// Init config types and options
// ---------------------------------------------------------------------------

type UsageMode = 'native' | 'mcp';
type NativeFramework = 'skip' | 'ai-sdk' | 'mastra' | 'openai-agents' | 'claude-agent-sdk';

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
  { value: 'skip', label: 'Skip' },
  { value: 'ai-sdk', label: 'AI SDK' },
  { value: 'mastra', label: 'Mastra' },
  { value: 'openai-agents', label: 'OpenAI Agents' },
  { value: 'claude-agent-sdk', label: 'Claude Agent SDK' },
];

// ---------------------------------------------------------------------------
// InitConfig — type-safe builder for the init wizard answers
// ---------------------------------------------------------------------------

/**
 * Immutable config object built step-by-step through the init wizard.
 * Each `.with*` method returns a new instance with the added field,
 * narrowing the type so downstream code can rely on what has been set.
 *
 * The builder enforces that `build()` can only be called once ALL wizard
 * steps have been completed — calling it too early is a compile-time error.
 *
 * Future wizard steps (e.g., detected environment, dependency list) can be
 * added by introducing new `with*` methods and extending the `build()`
 * constraint.
 */
class InitConfigBuilder<T extends Record<string, unknown> = Record<string, never>> {
  private constructor(private readonly data: T) {}

  static create(): InitConfigBuilder {
    return new InitConfigBuilder({});
  }

  withUsageMode(mode: UsageMode): InitConfigBuilder<T & { usageMode: UsageMode }> {
    return new InitConfigBuilder({ ...this.data, usageMode: mode });
  }

  withFramework(
    fw: NativeFramework | undefined
  ): InitConfigBuilder<T & { framework: NativeFramework | undefined }> {
    return new InitConfigBuilder({ ...this.data, framework: fw });
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
      framework: NativeFramework | undefined;
      installSkills: boolean;
      detectedEnv: ProjectEnvironment | undefined;
      installPlan: CoreDependencyPlan | undefined;
    }>
  ): InitConfig {
    return {
      usageMode: this.data.usageMode,
      framework: this.data.framework,
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
  readonly framework: NativeFramework | undefined;
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
 * After detecting the project environment and resolving an install plan,
 * ask the user to confirm the detected package manager or skip installation.
 * Returns the plan if confirmed, `undefined` if skipped.
 */
const confirmInstallPlan = (plan: CoreDependencyPlan) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;

    type PmChoice = 'confirm' | 'skip';
    const choice = yield* ui.select<PmChoice>(
      `Install ${plan.dependency} using ${plan.packageManager}?`,
      [
        { value: 'confirm' as PmChoice, label: plan.packageManager, hint: plan.installCommand },
        { value: 'skip' as PmChoice, label: 'Skip' },
      ]
    );

    return choice === 'confirm' ? plan : undefined;
  });

/**
 * Runs the interactive init wizard.
 *
 * Steps:
 * 1. Usage mode — "Native tools" or "Composio MCP"
 * 2. Framework — which agent framework (only if native)
 * 3. Install skills — whether to install Composio coding-agent skills
 * 4. Detect project environment (only if native)
 * 5. Resolve + confirm install plan (only if native and environment detected)
 *
 * All inputs are collected through the builder before any side effects run.
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

    // Step 2: Framework (only for native tools)
    const framework: NativeFramework | undefined =
      usageMode === 'native'
        ? yield* ui
            .select<NativeFramework>('Which framework do you use?', NATIVE_FRAMEWORK_OPTIONS)
            .pipe(Effect.map(fw => (fw === 'skip' ? undefined : fw)))
        : undefined;

    // Step 3: Install Composio skills (skip prompt when --no-skills)
    const installSkills = params.noSkills
      ? false
      : yield* ui.confirm('Install Composio skills for your Coding Agent?', {
          defaultValue: true,
        });

    // Steps 4+5: Detect environment + confirm install plan (only for native tools)
    let detectedEnv: ProjectEnvironment | undefined;
    let installPlan: CoreDependencyPlan | undefined;

    if (usageMode === 'native') {
      // Step 4: Detect project environment
      detectedEnv = yield* detectEnvironment(cwd);

      // Step 5: Resolve install plan and confirm package manager
      if (detectedEnv) {
        const plan = yield* resolveInstallPlan(cwd);
        if (plan) {
          installPlan = yield* confirmInstallPlan(plan);
        }
      }
    }

    return InitConfigBuilder.create()
      .withUsageMode(usageMode)
      .withFramework(framework)
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
  if (config.framework) {
    payload.framework = config.framework;
  }
  payload.install_skills = config.installSkills;
  if (config.detectedEnv) {
    payload.detected_language = config.detectedEnv.language;
    payload.package_manager = config.detectedEnv.packageManager;
  }
  return JSON.stringify(payload, null, 2);
};

/** Writes project keys + init config to `<cwd>/.composio/` and creates a `.gitignore`. */
const writeProjectConfig = (composioDir: string, selected: ProjectKeys, config: InitConfig) =>
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

    yield* fs.writeFileString(path.join(composioDir, 'config.json'), initConfigToJSON(config));

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
 * Handles --dry-run, --force, --yes flags and already-installed detection.
 */
const runInstallStep = (params: {
  config: InitConfig;
  cwd: string;
  dryRun: boolean;
  force: boolean;
  yes: boolean;
}) =>
  Effect.gen(function* () {
    const { config, cwd, dryRun, force, yes } = params;
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

    const shouldInstall =
      yes || (yield* ui.confirm(`Run: ${plan.installCommand}?`, { defaultValue: true }));
    if (!shouldInstall) {
      yield* ui.log.warn('Installation cancelled.');
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
// Skills install step — runs `npx skills add composiohq/skills`
// ---------------------------------------------------------------------------

const SKILLS_INSTALL_COMMAND = 'npx skills add composiohq/skills';

/**
 * Runs the Composio skills installation step.
 * Uses `npx skills add composiohq/skills` to install coding-agent skills.
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
    const runner = yield* CommandRunner;

    if (dryRun) {
      yield* ui.note(SKILLS_INSTALL_COMMAND, 'Skills Install Command');
      return;
    }

    const shouldInstall =
      yes || (yield* ui.confirm(`Run: ${SKILLS_INSTALL_COMMAND}?`, { defaultValue: true }));
    if (!shouldInstall) {
      yield* ui.log.warn('Skills installation cancelled.');
      return;
    }

    const [cmd, ...args] = SKILLS_INSTALL_COMMAND.split(' ');
    const command = PlatformCommand.make(cmd!, ...args).pipe(
      PlatformCommand.workingDirectory(cwd)
    );

    const install = Effect.gen(function* () {
      const exitCode = yield* runner.run(command);
      if (exitCode !== 0) {
        yield* Effect.fail(new Error(`Skills install command failed with exit code ${exitCode}`));
      }
    });

    yield* ui
      .withSpinner('Installing Composio skills...', install, {
        successMessage: 'Installed Composio skills.',
        errorMessage: 'Failed to install Composio skills.',
      })
      .pipe(
        Effect.catchAll(e =>
          Effect.gen(function* () {
            yield* ui.log.error(
              `Skills install failed: ${e instanceof Error ? e.message : String(e)}`
            );
            yield* ui.log.info(`You can install manually: ${SKILLS_INSTALL_COMMAND}`);
          })
        )
      );
  });

// ---------------------------------------------------------------------------
// Structured output helper
// ---------------------------------------------------------------------------

const makeOutputJson = (selected: ProjectKeys, config: InitConfig, composioDir: string) =>
  JSON.stringify({
    org_id: selected.orgId,
    project_id: selected.projectId,
    usage_mode: config.usageMode,
    framework: config.framework ?? null,
    install_skills: config.installSkills,
    detected_language: config.detectedEnv?.language ?? null,
    package_manager: config.detectedEnv?.packageManager ?? null,
    install_command: config.installPlan?.installCommand ?? null,
    path: composioDir,
  });

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
      const ctx = yield* ComposioUserContext;
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
        };

        const config = yield* runInitWizard(proc.cwd, { noSkills });
        yield* writeProjectConfig(composioDir, selected, config);
        yield* runInstallStep({ config, cwd: proc.cwd, dryRun, force, yes });
        yield* runSkillsInstallStep({ config, cwd: proc.cwd, dryRun, yes });

        yield* ui.log.success(`Project initialized in ${composioDir}/`);
        yield* ui.output(makeOutputJson(selected, config, composioDir));
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

    // 1. Ensure user is logged in
    if (!ctx.isLoggedIn()) {
      yield* ui.log.step('No credentials found. Logging in...');
      yield* browserLogin({ scope: 'project', noBrowser });
    }

    // 2. Fetch projects
    const apiKey = Option.getOrUndefined(ctx.data.apiKey);
    const orgIdValue = Option.getOrUndefined(ctx.data.orgId);
    const projectIdValue = Option.getOrUndefined(ctx.data.projectId);
    if (!apiKey || !orgIdValue || !projectIdValue) {
      yield* ui.log.warn(
        'No API key, org ID, or project ID found. Please try `composio login` first.'
      );
      yield* ui.outro('');
      return;
    }

    const orgProjects = yield* listOrgProjects({
      baseURL: ctx.data.baseURL,
      apiKey,
      orgId: orgIdValue,
      projectId: projectIdValue,
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
    });

    const selectedProject: OrgProject =
      orgProjects.data.length === 1
        ? orgProjects.data[0]
        : yield* ui.select<OrgProject>(
            'Select a project:',
            orgProjects.data.map(p => ({ value: p, label: p.name, hint: p.id }))
          );

    const selected = orgProjectToKeys(selectedProject);
    yield* ui.log.step(`Using project "${selectedProject.name}"`);

    // 4. Run wizard + write config + install
    const config = yield* runInitWizard(proc.cwd, { noSkills });
    yield* writeProjectConfig(composioDir, selected, config);
    yield* runInstallStep({ config, cwd: proc.cwd, dryRun, force, yes });
    yield* runSkillsInstallStep({ config, cwd: proc.cwd, dryRun, yes });

    yield* ui.log.success(`Project initialized in ${composioDir}/`);
    yield* ui.output(makeOutputJson(selected, config, composioDir));
    yield* ui.outro('');
  });
