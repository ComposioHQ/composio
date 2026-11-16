import { expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const oxlint = join(root, 'node_modules/oxlint/bin/oxlint');

test('the repository config enforces both Effect rules only in CLI source', () => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'composio-effect-lint-')));
  const config = join(cwd, '.oxlintrc.json');
  symlinkSync(join(root, 'node_modules'), join(cwd, 'node_modules'), 'dir');
  writeFileSync(
    config,
    readFileSync(join(root, '.oxlintrc.json'), 'utf8').replace(
      './tools/oxlint/effect/index.ts',
      join(root, 'tools/oxlint/effect/index.ts')
    )
  );
  const source = `
    import { Context, Effect, Layer } from 'effect';
    class Client extends Context.Service<Client, {}>()('Client') {
      static make = Effect.gen(function* () {
        yield* load.pipe(Effect.orDie);
        return {};
      });
    }
    const result = load.pipe(Effect.mapError(() => new Failed()));
  `;
  const lint = (filename: string) => {
    const file = join(cwd, filename);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
    const result = Bun.spawnSync(['node', oxlint, '-c', config, '--format', 'json', filename], {
      cwd,
    });
    expect(result.stderr.toString()).toBe('');
    const output = JSON.parse(result.stdout.toString());
    return {
      status: result.exitCode,
      rules: output.diagnostics
        .map((diagnostic: { code: string }) => diagnostic.code)
        .filter((code: string) => code.startsWith('composio-effect(')),
    };
  };
  try {
    expect(lint('ts/packages/cli/src/services/lint-fixture.ts')).toEqual({
      status: 1,
      rules: expect.arrayContaining([
        'composio-effect(require-cause-when-narrowing)',
        'composio-effect(no-ordie-in-service-construction)',
      ]),
    });
    for (const file of [
      'ts/packages/core/src/lint-fixture.ts',
      'ts/packages/cli/test/lint-fixture.ts',
      'ts/packages/cli/src/services/lint-fixture.test.ts',
      'ts/packages/cli/src/services/__fixtures__/lint-fixture.ts',
    ]) {
      expect(lint(file).rules).toEqual([]);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
