import os from 'node:os';
import path from 'node:path';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { ValidationError, HelpDoc } from '@effect/cli';
import { cli, pkg, TestLive, MockConsole } from 'test/__utils__';
import { afterEach, vi } from 'vitest';

type CommandMismatchResult = {
  _tag: string;
  error: {
    _tag: string;
    value: {
      _tag: string;
      value: string;
    };
  };
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
        const commandMismatch = result as CommandMismatchResult;

        expect(result).toEqual(expect.any(Object));
        expect(commandMismatch._tag).toBe(ValidationError.commandMismatch(HelpDoc.p(''))._tag);
        expect(commandMismatch.error._tag).toBe('Paragraph');
        expect(commandMismatch.error.value._tag).toBe('Text');
        expect(commandMismatch.error.value.value).toContain('Invalid subcommand for composio');
        expect(commandMismatch.error.value.value).toContain("'generate'");
        expect(commandMismatch.error.value.value).toContain("'orgs'");
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] invalid tools subcommand [Then] report tools-scoped mismatch', () =>
      Effect.gen(function* () {
        const args = ['tools', 'search', 'metabase', 'put'];

        const result = yield* cli(args).pipe(Effect.catchAll(e => Effect.succeed(e)));
        const commandMismatch = result as CommandMismatchResult;

        expect(result).toEqual(expect.any(Object));
        expect(commandMismatch._tag).toBe(ValidationError.commandMismatch(HelpDoc.p(''))._tag);
        expect(commandMismatch.error._tag).toBe('Paragraph');
        expect(commandMismatch.error.value._tag).toBe('Text');
        expect(commandMismatch.error.value.value).toContain(
          'Invalid subcommand for composio tools'
        );
        expect(commandMismatch.error.value.value).toContain("'info'");
        expect(commandMismatch.error.value.value).toContain("'list'");
        expect(commandMismatch.error.value.value).not.toContain("'version'");
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] no args [Then] prints help message', () =>
      Effect.gen(function* () {
        yield* cli([]);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');
        expect(output).toContain('Usage:');
        expect(output).toContain('composio');
        expect(output).toContain('composio connections list');
      })
    );
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
        const write = vi
          .spyOn(process.stdout, 'write')
          .mockImplementation((() => true) as typeof process.stdout.write);

        yield* cli(['debug', 'who-is-my-master']);
        const output = write.mock.calls.map(call => String(call[0])).join('\n');

        expect(output).toContain('"master": "codex"');
      })
    );
  });

  layer(TestLive())(it => {
    it.scoped('[Given] artifacts cwd [Then] it prints the current session artifact directory', () =>
      Effect.gen(function* () {
        const write = vi
          .spyOn(process.stdout, 'write')
          .mockImplementation((() => true) as typeof process.stdout.write);

        yield* cli(['artifacts', 'cwd']);
        const output = write.mock.calls
          .map(call => String(call[0]))
          .join('\n')
          .trim();

        expect(output).toContain(path.join(os.tmpdir(), 'composio'));
      })
    );
  });
});
