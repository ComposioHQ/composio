import path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { Console, Effect, Exit } from 'effect';
import { FileSystem } from '@effect/platform';
import { NodeProcess } from 'src/services/node-process';
import { TerminalUI } from 'src/services/terminal-ui';
import { CommandRunner } from 'src/services/command-runner';
import { CommandExecutor } from '@effect/platform';
import { cli, TestLive, MockConsole } from 'test/__utils__';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read all captured output lines as a single string. */
const getOutput = () =>
  MockConsole.getLines({ stripAnsi: true }).pipe(Effect.map(lines => lines.join('\n')));

/** Build a TerminalUI override that rejects at the confirmation prompt. */
const terminalUIThatCancelsConfirm = TerminalUI.of({
  output: data => Console.log(data),
  intro: title => Console.log(`-- ${title} --`),
  outro: message => Console.log(`-- ${message} --`),
  log: {
    info: message => Console.log(message),
    success: message => Console.log(message),
    warn: message => Console.warn(message),
    error: message => Console.error(message),
    step: message => Console.log(message),
    message: message => Console.log(message),
  },
  note: (message, title) => Console.log(title ? `[${title}] ${message}` : message),
  // confirm returns false → user cancelled
  confirm: () => Effect.succeed(false),
  select: (_message, options) => Effect.succeed(options[0].value),
  multiSelect: (_message, options) => Effect.succeed(options.map(o => o.value)),
  withSpinner: (_message, effect, options) =>
    Effect.gen(function* () {
      const result = yield* effect;
      const successMsg =
        typeof options?.successMessage === 'function'
          ? options.successMessage(result)
          : (options?.successMessage ?? _message);
      yield* Console.log(successMsg);
      return result;
    }),
  useMakeSpinner: (_message, use) =>
    Effect.gen(function* () {
      let stopped = false;
      const handle = {
        message: (_msg: string) => Effect.void,
        stop: (msg?: string) =>
          Effect.gen(function* () {
            stopped = true;
            if (msg) yield* Console.log(msg);
          }),
        error: (msg?: string) =>
          Effect.gen(function* () {
            stopped = true;
            if (msg) yield* Console.error(msg);
          }),
      };
      const exit = yield* Effect.exit(use(handle));
      if (Exit.isFailure(exit) && !stopped) {
        yield* Console.error(_message);
      }
      return yield* exit;
    }),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI: composio init', () => {
  // ── Agent-native path (--org-id + --project-id) ───────────────────

  describe('[Given] --org-id + --project-id flags', () => {
    layer(TestLive({ fixture: 'typescript-project' }))(it => {
      it.scoped('[Then] it runs wizard, writes config, and prints machine output', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const proc = yield* NodeProcess;

          yield* cli(['init', '--org-id', 'org1', '--project-id', 'proj1', '--yes']);

          const output = yield* getOutput();

          expect(output).toContain('-- composio init --');
          expect(output).toContain('Project initialized in');
          expect(output).toContain('"org_id":"org1"');
          expect(output).toContain('"project_id":"proj1"');

          // Wizard fields are present in structured output
          expect(output).toContain('"usage_mode"');
          expect(output).toContain('"install_skills"');

          // project.json was created
          const projectConfigPath = path.join(proc.cwd, '.composio', 'project.json');
          const exists = yield* fs.exists(projectConfigPath);
          expect(exists).toBe(true);

          const projectConfigRaw = yield* fs.readFileString(projectConfigPath, 'utf8');
          const projectConfig = JSON.parse(projectConfigRaw) as Record<string, unknown>;
          expect(projectConfig.org_id).toBe('org1');
          expect(projectConfig.project_id).toBe('proj1');

          // config.json was created alongside project.json
          const configJsonPath = path.join(proc.cwd, '.composio', 'config.json');
          const configExists = yield* fs.exists(configJsonPath);
          expect(configExists).toBe(true);

          const configRaw = yield* fs.readFileString(configJsonPath, 'utf8');
          const config = JSON.parse(configRaw) as Record<string, unknown>;
          expect(config.usage_mode).toBe('native'); // first option selected by test TerminalUI
          expect(config.frameworks).toEqual([
            'ai-sdk',
            'mastra',
            'openai-agents',
            'claude-agent-sdk',
          ]); // multiSelect returns all options in test
          expect(config.install_skills).toBe(true); // confirm defaults to true
        })
      );
    });
  });

  describe('[Given] explicit project ids but no global credentials', () => {
    layer(TestLive({ fixture: 'typescript-project' }))(it => {
      it.scoped('[Then] it writes config but skips .env.local (no API key)', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const proc = yield* NodeProcess;

          yield* cli(['init', '--org-id', 'org1', '--project-id', 'proj1', '--no-skills']);

          const output = yield* getOutput();

          // Wizard still ran (config.json should exist)
          const configJsonPath = path.join(proc.cwd, '.composio', 'config.json');
          const configExists = yield* fs.exists(configJsonPath);
          expect(configExists).toBe(true);

          // Environment variables are not printed when there is no global API key
          expect(output).not.toContain('COMPOSIO_API_KEY');

          // .env.local was NOT created inside .composio/ (no credentials to write)
          const envLocalPath = path.join(proc.cwd, '.composio', '.env.local');
          const envLocalExists = yield* fs.exists(envLocalPath);
          expect(envLocalExists).toBe(false);
        })
      );
    });
  });

  // ── --no-skills flag ──────────────────────────────────────────────

  describe('[Given] --no-skills flag', () => {
    layer(TestLive({ fixture: 'typescript-project' }))(it => {
      it.scoped('[Then] it skips skills prompts and sets install_skills to false', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const proc = yield* NodeProcess;

          yield* cli(['init', '--org-id', 'org1', '--project-id', 'proj1', '--yes', '--no-skills']);

          const output = yield* getOutput();

          // Skills-related prompts did not appear
          expect(output).not.toContain('Cloning Composio skills');
          expect(output).not.toContain('Installation scope');
          expect(output).not.toContain('Installation method');

          // config.json has install_skills: false
          const configJsonPath = path.join(proc.cwd, '.composio', 'config.json');
          const configRaw = yield* fs.readFileString(configJsonPath, 'utf8');
          const config = JSON.parse(configRaw) as Record<string, unknown>;
          expect(config.install_skills).toBe(false);

          // Structured output also reflects no skills
          expect(output).toContain('"install_skills":false');
        })
      );
    });
  });

  // ── --yes flag (fully non-interactive) ─────────────────────────────

  describe('[Given] --yes flag', () => {
    layer(TestLive({ fixture: 'typescript-project' }))(it => {
      it.scoped('[Then] it uses defaults for all prompts (native, all frameworks, skills)', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const proc = yield* NodeProcess;

          yield* cli([
            'init',
            '--org-id',
            'org1',
            '--project-id',
            'proj1',
            '--yes',
            '--no-skills', // skip skills to avoid interactive selectAgentsInteractive in test
          ]);

          const output = yield* getOutput();

          // Config was written with defaults
          const configJsonPath = path.join(proc.cwd, '.composio', 'config.json');
          const configRaw = yield* fs.readFileString(configJsonPath, 'utf8');
          const config = JSON.parse(configRaw) as Record<string, unknown>;
          expect(config.usage_mode).toBe('native');
          expect(config.frameworks).toEqual([
            'ai-sdk',
            'mastra',
            'openai-agents',
            'claude-agent-sdk',
          ]);

          // No interactive prompts were shown (usage mode, frameworks)
          expect(output).not.toContain('How would you like to use Composio?');
          expect(output).not.toContain('Which frameworks do you use?');

          // Init completed
          expect(output).toContain('Project initialized in');
        })
      );
    });
  });

  // ── --dry-run flag ────────────────────────────────────────────────

  describe('[Given] --dry-run flag', () => {
    layer(TestLive({ fixture: 'typescript-project' }))(it => {
      it.scoped('[Then] it shows summary but writes no files', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const proc = yield* NodeProcess;

          yield* cli([
            'init',
            '--org-id',
            'org1',
            '--project-id',
            'proj1',
            '--yes',
            '--dry-run',
            '--no-skills',
          ]);

          const output = yield* getOutput();

          expect(output).toContain('Dry run complete');

          // No config files were written
          const composioDir = path.join(proc.cwd, '.composio');
          const projectJsonExists = yield* fs.exists(path.join(composioDir, 'project.json'));
          const configJsonExists = yield* fs.exists(path.join(composioDir, 'config.json'));
          const envLocalExists = yield* fs.exists(path.join(composioDir, '.env.local'));
          expect(projectJsonExists).toBe(false);
          expect(configJsonExists).toBe(false);
          expect(envLocalExists).toBe(false);
        })
      );
    });
  });

  // ── Cancellation at confirmation ──────────────────────────────────

  describe('[Given] user cancels at confirmation prompt', () => {
    layer(
      TestLive({
        fixture: 'typescript-project',
        terminalUI: terminalUIThatCancelsConfirm,
      })
    )(it => {
      it.scoped('[Then] it writes nothing and exits cleanly', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const proc = yield* NodeProcess;

          yield* cli(['init', '--org-id', 'org1', '--project-id', 'proj1']);

          const output = yield* getOutput();

          expect(output).toContain('Installation cancelled');

          // Nothing was written
          const composioDir = path.join(proc.cwd, '.composio');
          const projectJsonExists = yield* fs.exists(path.join(composioDir, 'project.json'));
          const configJsonExists = yield* fs.exists(path.join(composioDir, 'config.json'));
          expect(projectJsonExists).toBe(false);
          expect(configJsonExists).toBe(false);
        })
      );
    });
  });

  // ── Dep install failure ───────────────────────────────────────────

  describe('[Given] dependency installation fails', () => {
    layer(
      TestLive({
        fixture: 'typescript-project',
        commandRunner: new CommandRunner({
          run: () => Effect.succeed(CommandExecutor.ExitCode(1)),
        }),
      })
    )(it => {
      it.scoped('[Then] it shows fallback install command and still reports success', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const proc = yield* NodeProcess;

          yield* cli(['init', '--org-id', 'org1', '--project-id', 'proj1', '--yes', '--no-skills']);

          const output = yield* getOutput();

          // Install failed but init still completed
          expect(output).toContain('Install failed');
          expect(output).toContain('Dependency installation failed. Install manually:');
          expect(output).toContain('Project initialized in');

          // Config was still written (Phase 3 writes config before install step)
          const configJsonPath = path.join(proc.cwd, '.composio', 'config.json');
          const configExists = yield* fs.exists(configJsonPath);
          expect(configExists).toBe(true);
        })
      );
    });
  });

  // ── .gitignore creation ───────────────────────────────────────────

  describe('[Given] .composio directory does not exist', () => {
    layer(TestLive({ fixture: 'typescript-project' }))(it => {
      it.scoped('[Then] it creates .composio/.gitignore with wildcard', () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const proc = yield* NodeProcess;

          yield* cli(['init', '--org-id', 'org1', '--project-id', 'proj1', '--yes', '--no-skills']);

          const gitignorePath = path.join(proc.cwd, '.composio', '.gitignore');
          const gitignoreExists = yield* fs.exists(gitignorePath);
          expect(gitignoreExists).toBe(true);

          const content = yield* fs.readFileString(gitignorePath, 'utf8');
          expect(content).toBe('*\n');
        })
      );
    });
  });
});
