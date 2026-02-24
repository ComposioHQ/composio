import path from 'node:path';
import { Command, Options } from '@effect/cli';
import { Effect, Option } from 'effect';
import { FileSystem } from '@effect/platform';
import { ComposioUserContext } from 'src/services/user-context';
import { ProjectKeyRegistry } from 'src/services/project-key-registry';
import { NodeProcess } from 'src/services/node-process';
import { projectKeysToJSON, type ProjectKeys } from 'src/models/project-keys';
import * as constants from 'src/constants';
import { TerminalUI } from 'src/services/terminal-ui';

/**
 * `composio init` — Initialize a Composio project in the current directory.
 *
 * ## Current behavior
 *
 * 1. **Project selection** — picks from the `~/.composio/_keys/` registry
 *    (populated by `composio login`) or accepts explicit `--org-id`/`--project-id` flags.
 * 2. **Usage mode** — asks "Native tools" vs "Composio MCP".
 * 3. **Framework** — if native, asks which agent framework (AI SDK, Mastra, etc.).
 * 4. **Coding-agent skills** — asks whether to install Composio skills.
 * 5. **Writes config** — saves `<cwd>/.composio/project.json` and `<cwd>/.composio/config.json`.
 *
 * ## Planned improvements (future PRs)
 *
 * ### Remote project selection
 * The project picker currently reads from the local `_keys/` registry, which only
 * contains the single project from the most recent `composio login`. In the future,
 * `composio init` should:
 * - Call a projects API (e.g., `GET /api/v3/projects`) using the UAK + `x-org-id`
 *   to fetch ALL projects available to the logged-in user's organization.
 * - Present them in the Clack `select` picker with human-readable names.
 * - Optionally create a new project-scoped session (`scope: 'project'`) to
 *   obtain a project-level API key.
 *
 * ### Project environment detection
 * After project selection, detect the kind of project in the current directory:
 * - **TypeScript monorepo** — pnpm/yarn/npm workspaces, `turbo.json`, `tsconfig.json`
 * - **TypeScript single-package** — `package.json` with `typescript` dep
 * - **Python flat repo** — `pyproject.toml` or `setup.py` with `uv` / `pip`
 * - **Python monorepo** — `uv` workspaces
 *
 * This detection should reuse or extend the existing `EnvLangDetector` and
 * `JsPackageManagerDetector` services. The detected environment determines
 * which Composio packages to install (e.g., `@composio/core` for TS,
 * `composio` for Python) and which provider package to add (e.g.,
 * `@composio/mastra`, `@composio/openai`, `composio[openai]`).
 *
 * ### Dependency installation
 * Based on the detected environment and chosen framework, automatically install
 * the appropriate Composio dependencies:
 * - **TypeScript (pnpm)**: `pnpm add @composio/core @composio/<framework>`
 * - **TypeScript (npm)**: `npm install @composio/core @composio/<framework>`
 * - **Python (uv)**: `uv add composio composio[<framework>]`
 * - **Python (pip)**: `pip install composio composio[<framework>]`
 *
 * ### Composio skills installation
 * When the user opts in to "Install Composio skills for your Coding Agent?",
 * run the skills installer for the detected coding agent:
 * - `npx skills add ComposioHQ/skills` (or the equivalent for the platform)
 *
 * This should be gated behind the `installSkills` flag in `InitConfig` and
 * only executed after the config files are written (so the skills can read
 * the project context from `.composio/`).
 */

const orgIdOpt = Options.text('org-id').pipe(
  Options.optional,
  Options.withDescription('Organization ID (skip interactive picker)')
);

const projectIdOpt = Options.text('project-id').pipe(
  Options.optional,
  Options.withDescription('Project ID (skip interactive picker)')
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
    hint: 'Use with Agent frameworks (AI SDK, Mastra, etc.)',
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

  // Future builder steps:
  // withDetectedEnv(env: DetectedEnv): InitConfigBuilder<T & { detectedEnv: DetectedEnv }>
  // withDependencies(deps: string[]): InitConfigBuilder<T & { dependencies: string[] }>

  /** Extract the final config. Only callable when all required fields are present. */
  build(
    this: InitConfigBuilder<{
      usageMode: UsageMode;
      framework: NativeFramework | undefined;
      installSkills: boolean;
    }>
  ): InitConfig {
    return {
      usageMode: this.data.usageMode,
      framework: this.data.framework,
      installSkills: this.data.installSkills,
    };
  }

  /** Read accumulated data (for intermediate access). */
  get value(): T {
    return this.data;
  }
}

/**
 * The finalized init configuration, produced by `InitConfigBuilder.build()`.
 *
 * Future fields to add:
 * - `detectedEnv`: the detected project environment (TS monorepo, Python flat, etc.)
 * - `dependencies`: the list of packages to install
 * - `packageManager`: the detected package manager (pnpm, npm, yarn, uv, pip)
 */
interface InitConfig {
  readonly usageMode: UsageMode;
  readonly framework: NativeFramework | undefined;
  readonly installSkills: boolean;
}

// ---------------------------------------------------------------------------
// Init wizard — collects all answers via the builder
// ---------------------------------------------------------------------------

/**
 * Runs the interactive init wizard.
 *
 * Steps:
 * 1. Usage mode — "Native tools" or "Composio MCP"
 * 2. Framework — which agent framework (only if native)
 * 3. Install skills — whether to install Composio coding-agent skills
 *
 * Future steps (to be added before `build()`):
 * 4. Detect project environment (TS/Python, monorepo/flat, package manager)
 * 5. Confirm dependency installation
 *
 * Returns a fully-built `InitConfig`.
 */
const runInitWizard = Effect.gen(function* () {
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

  // Step 3: Install Composio skills (always asked)
  // Future: when installSkills is true, run `npx skills add ComposioHQ/skills`
  // after writing config files (so the skills can read `.composio/` context).
  const installSkills = yield* ui.confirm('Install Composio skills for your Coding Agent?', {
    defaultValue: true,
  });

  // Future steps would go here:
  // Step 4: const detectedEnv = yield* detectProjectEnvironment;
  // Step 5: const dependencies = yield* confirmDependencies(usageMode, framework, detectedEnv);

  return InitConfigBuilder.create()
    .withUsageMode(usageMode)
    .withFramework(framework)
    .withInstallSkills(installSkills)
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
  return JSON.stringify(payload, null, 2);
};

/**
 * Writes project keys + init config to `<cwd>/.composio/` and creates a `.gitignore`.
 *
 * Future: after writing config, this function (or a post-write hook) should:
 * - Run dependency installation based on `config.framework` and the detected env.
 * - Run `npx skills add ComposioHQ/skills` if `config.installSkills` is true.
 */
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

/**
 * Helper to format a profile for display.
 */
const profileLabel = (p: ProjectKeys): string => Option.getOrElse(p.projectName, () => p.projectId);

const profileHint = (p: ProjectKeys): string => Option.getOrElse(p.orgName, () => p.orgId);

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
 * 1. Interactive: Reads from the global key registry and prompts for selection
 * 2. Non-interactive: Accepts --org-id and --project-id flags for agents/CI
 *
 * @example
 * ```bash
 * composio init
 * composio init --org-id <org> --project-id <project>
 * ```
 */
export const initCmd = Command.make(
  'init',
  { orgId: orgIdOpt, projectId: projectIdOpt },
  ({ orgId, projectId }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;
      const ctx = yield* ComposioUserContext;
      const registry = yield* ProjectKeyRegistry;
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

        const config = yield* runInitWizard;

        yield* writeProjectConfig(composioDir, selected, config);

        // Future: if config.installSkills, run `npx skills add ComposioHQ/skills`
        // Future: install Composio dependencies based on config.framework + detected env

        yield* ui.log.success(`Project initialized in ${composioDir}/`);
        yield* ui.output(
          JSON.stringify({
            org_id: selected.orgId,
            project_id: selected.projectId,
            usage_mode: config.usageMode,
            framework: config.framework ?? null,
            install_skills: config.installSkills,
            path: composioDir,
          })
        );
        yield* ui.outro('');
        return;
      }

      // 1. Ensure user is logged in
      if (!ctx.isLoggedIn()) {
        yield* ui.log.warn('You must be logged in first.');
        yield* ui.log.info('Run `composio login` to authenticate.');
        yield* ui.outro('');
        return;
      }

      // 2. Read available project profiles from registry
      // Future: fetch ALL projects for the user's org via API instead of reading
      // from the local _keys/ registry. This requires a projects API endpoint
      // (e.g., GET /api/v3/projects with x-api-key + x-org-id headers).
      const profiles = yield* registry.listAll();

      if (profiles.length === 0) {
        yield* ui.log.warn('No project profiles found in the registry.');
        yield* ui.log.info(
          'Use `composio init --org-id <org> --project-id <project>` to set up your project.'
        );
        yield* ui.log.info(
          'You can find your org and project IDs at https://app.composio.dev/settings'
        );
        yield* ui.outro('');
        return;
      }

      // 3. Select a project profile
      const selected: ProjectKeys =
        profiles.length === 1
          ? profiles[0]
          : yield* ui.select<ProjectKeys>(
              'Select a project:',
              profiles.map(p => ({
                value: p,
                label: profileLabel(p),
                hint: profileHint(p),
              }))
            );

      yield* ui.log.step(`Using project "${profileLabel(selected)}"`);

      // 4. Run the init wizard (usage mode → framework → install skills)
      const config = yield* runInitWizard;

      // 5. Write <cwd>/.composio/project.json + config.json + .gitignore
      yield* writeProjectConfig(composioDir, selected, config);

      // Future: if config.installSkills, run `npx skills add ComposioHQ/skills`
      // Future: detect project env (TS monorepo / Python flat / etc.) and install
      //         the appropriate Composio packages:
      //         - TS (pnpm): pnpm add @composio/core @composio/<framework>
      //         - TS (npm):  npm install @composio/core @composio/<framework>
      //         - Python (uv): uv add composio composio[<framework>]
      //         - Python (pip): pip install composio composio[<framework>]

      yield* ui.log.success(`Project initialized in ${composioDir}/`);

      // 6. Emit structured JSON for piped/scripted consumption
      yield* ui.output(
        JSON.stringify({
          org_id: selected.orgId,
          project_id: selected.projectId,
          usage_mode: config.usageMode,
          framework: config.framework ?? null,
          install_skills: config.installSkills,
          path: composioDir,
        })
      );

      yield* ui.outro('');
    })
).pipe(Command.withDescription('Initialize a Composio project in the current directory.'));
