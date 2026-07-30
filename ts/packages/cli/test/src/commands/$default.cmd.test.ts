import os from 'node:os';
import path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { ValidationError, HelpDoc } from '@effect/cli';
import { cli, pkg, TestLive, MockConsole } from 'test/__utils__';
import { makeTerminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';
import { TerminalUI } from 'src/services/terminal-ui';
import { afterEach, vi } from 'vitest';

const getCommandMismatch = (value: unknown): ValidationError.CommandMismatch => {
  if (!ValidationError.isValidationError(value) || !ValidationError.isCommandMismatch(value)) {
    throw new Error('Expected a command mismatch');
  }
  return value;
};

describe('CLI: composio', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  layer(TestLive())(it => {
    it.scoped('[Given] unknown argument [Then] print error message', () =>
      Effect.gen(function* () {
        const args = ['--bar'];

        const result = yield* cli(args).pipe(Effect.catchAll(e => Effect.succeed(e)));
        const commandMismatch = getCommandMismatch(result);
        const message = HelpDoc.toAnsiText(commandMismatch.error);

        expect(message).toContain('Invalid subcommand for composio');
        expect(message).toContain("'generate'");
        expect(message).toContain("'orgs'");
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] invalid tools subcommand [Then] report tools-scoped mismatch', () =>
      Effect.gen(function* () {
        const args = ['tools', 'search', 'metabase', 'put'];

        const result = yield* cli(args).pipe(Effect.catchAll(e => Effect.succeed(e)));
        const commandMismatch = getCommandMismatch(result);
        const message = HelpDoc.toAnsiText(commandMismatch.error);

        expect(message).toContain('Invalid subcommand for composio tools');
        expect(message).toContain("'info'");
        expect(message).toContain("'list'");
        expect(message).not.toContain("'version'");
      })
    );
  });

  layer(TestLive({ cliUserConfig: { onboarding: { hasExecuted: true } } }))(it => {
    it.scoped('[Given] no args and a finished onboarding [Then] prints help message', () =>
      Effect.gen(function* () {
        yield* cli([]);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        expect(output).toContain('Usage:');
        expect(output).toContain('composio');
        expect(output).not.toContain('composio connections list');
        expect(output).not.toContain('composio onboard` to');
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] no args and an unfinished onboarding [Then] nudges toward onboard', () =>
      Effect.gen(function* () {
        yield* cli([]);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        expect(output).toContain('composio onboard');
        // The nudge replaces root help; it does not print both.
        expect(output).not.toContain('Usage:');
      })
    );
  });

  describe('the nudge goes to stderr and survives redirection', () => {
    const stdoutWrites: Array<string> = [];
    const stderrWrites: Array<string> = [];

    // Built with all three streams captured, so the double's own `canDecorate` gate is off: every
    // `log.*`/`note` write is suppressed exactly as it would be in production. What is left is
    // `ui.error`, which production writes unconditionally — so this pins that the nudge uses it.
    const streamRecordingUI = TerminalUI.of({
      ...makeTerminalUITestImpl({ tty: { stdin: false, stdout: false, stderr: false } }),
      output: data => Effect.sync(() => void stdoutWrites.push(data)),
      error: data => Effect.sync(() => void stderrWrites.push(data)),
    });

    layer(TestLive({ terminalUI: streamRecordingUI }))(it => {
      it.scoped('[Given] captured stderr [Then] bare composio still says something', () =>
        Effect.gen(function* () {
          stdoutWrites.length = 0;
          stderrWrites.length = 0;

          yield* cli([]);

          // Prose never lands on the data stream, and the command is never silent on every stream.
          expect(stdoutWrites).toEqual([]);
          expect(stderrWrites.join('\n')).toContain('composio onboard');
        })
      );
    });
  });

  layer(TestLive())(it => {
    it.scoped('[Given] --help flag [Then] prints help message', () =>
      Effect.gen(function* () {
        const args = ['--help'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        expect(output.trim().length).toBeGreaterThan(0);
        expect(output).toContain('config.json');
        expect(output).not.toContain('connections list');
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] --help simple [Then] prints the compact root help mode', () =>
      Effect.gen(function* () {
        yield* cli(['--help', 'simple']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('simple help');
        expect(output).toContain('composio --help [simple|default|full]');
        expect(output).not.toContain('composio run');
        expect(output).not.toContain('MORE COMMANDS');
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] --help full [Then] prints the expanded root help mode', () =>
      Effect.gen(function* () {
        yield* cli(['--help', 'full']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('full help');
        expect(output).toContain('MORE COMMANDS');
        expect(output).toContain('dev playground-execute');
        expect(output).toContain('generate ts');
        expect(output).toContain('connections list');
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped("[Given] --version flag [Then] prints composio's version from package.json", () =>
      Effect.gen(function* () {
        const args = ['--version'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(pkg.version);
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped("[Given] -v flag [Then] prints composio's version from package.json", () =>
      Effect.gen(function* () {
        const args = ['-v'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(pkg.version);
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] debug who-is-my-master [Then] it prints the detected master as json', () =>
      Effect.gen(function* () {
        vi.stubEnv('CODEX_THREAD_ID', 'thread_123');
        vi.stubEnv('CLAUDE_CODE_ENTRYPOINT', 'sdk-ts');

        yield* cli(['debug', 'who-is-my-master']);
        const output = (yield* MockConsole.getLines()).join('\n');

        expect(output).toContain('"master": "codex"');
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] artifacts cwd [Then] it prints the current session artifact directory', () =>
      Effect.gen(function* () {
        yield* cli(['artifacts', 'cwd']);
        const output = (yield* MockConsole.getLines()).join('\n').trim();

        expect(output).toContain(path.join(os.tmpdir(), 'composio'));
      })
    );
  });
});
