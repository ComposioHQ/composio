import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  cpSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { compare, inventory, scan } from '../scripts/check-antislop.mjs';

test('the baseline binds allowances to source, file, rule and multiplicity', () => {
  const finding = {
    ruleId: 'ts-double-assertion',
    file: 'ts/packages/core/src/user.ts',
    lines: 'value as unknown as User',
  };
  const baseline = inventory([finding]);
  assert.deepEqual(compare(inventory([finding]), baseline), { added: [], stale: [] });
  for (const change of [
    { lines: 'other as unknown as User' },
    { file: 'ts/packages/cli/src/user.ts' },
    { ruleId: 'another-rule' },
  ]) {
    const result = compare(inventory([{ ...finding, ...change }]), baseline);
    assert.equal(result.added.length, 1);
    assert.equal(result.stale.length, 1);
  }
  assert.equal(compare(inventory([finding, finding]), baseline).added.length, 1);
  assert.equal(compare([], baseline).stale.length, 1);
  assert.deepEqual(
    inventory([{ ...finding, file: 'ts\\packages\\core\\src\\user.ts', lines: 'value\r\n' }]),
    inventory([{ ...finding, lines: 'value\n' }])
  );
  assert.throws(() => compare([], [...baseline, ...baseline]), /duplicate/);
  assert.throws(() => compare([], [{ ...baseline[0], count: -1 }]), /Invalid/);
});

test('scan discovers SDKs, CLI, scripts and hidden CI YAML while excluding generated code and tests', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'composio-antislop-'));
  const write = (file, contents) => {
    const path = join(cwd, file);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, contents);
  };
  try {
    copyFileSync(new URL('../sgconfig.yml', import.meta.url), join(cwd, 'sgconfig.yml'));
    cpSync(new URL('../.ast-grep/rules', import.meta.url), join(cwd, '.ast-grep/rules'), {
      recursive: true,
    });
    const cast = 'const user = value as unknown as User;';
    for (const file of [
      'ts/packages/core/src/user.ts',
      'ts/packages/cli/src/view.tsx',
      'ts/scripts/check.mts',
      'scripts/check.cts',
    ])
      write(file, cast);
    for (const file of [
      'ts/vendor/sample.ts',
      'ts/packages/core/generated/user.ts',
      'ts/packages/slim/generated/user.ts',
      'ts/packages/core/pack/generated/user.ts',
      'ts/packages/core/src/user.test.ts',
      'ts/packages/core/node_modules/lib/user.ts',
    ])
      write(file, cast);
    write('python/composio/user.py', 'user = external()  # type: ignore\n');
    write('python/providers/sample/provider.py', 'try:\n    work()\nexcept Exception:\n    pass\n');
    write('python/tests/test_user.py', 'user = external()  # type: ignore\n');
    write('.github/workflows/check.yaml', 'jobs:\n  check:\n    continue-on-error: true\n');
    write('.github/actions/check/action.yml', 'runs:\n  steps:\n    - run: ""\n');
    const findings = scan(cwd);
    assert.equal(findings.length, 8);
    assert.equal(new Set(findings.map(finding => finding.file)).size, 8);
    assert.equal(findings.filter(finding => finding.ruleId === 'ts-double-assertion').length, 4);
    assert.ok(findings.some(finding => finding.file === '.github/workflows/check.yaml'));
    assert.ok(findings.some(finding => finding.file === '.github/actions/check/action.yml'));

    // Exercise the public command, including the write boundary of --prune.
    copyFileSync(
      new URL('../scripts/check-antislop.mjs', import.meta.url),
      join(cwd, 'scripts/check-antislop.mjs')
    );
    symlinkSync(new URL('../node_modules', import.meta.url), join(cwd, 'node_modules'), 'junction');
    const baselinePath = join(cwd, '.ast-grep/baseline.json');
    writeFileSync(baselinePath, JSON.stringify(inventory(findings)) + '\n');
    const run = (...args) =>
      spawnSync(process.execPath, [join(cwd, 'scripts/check-antislop.mjs'), ...args], {
        cwd,
        encoding: 'utf8',
      });
    assert.equal(run().status, 0);
    write('ts/packages/core/src/user.ts', '\n\n' + cast);
    assert.equal(run().status, 0, 'line-number changes must not invalidate allowances');
    write('ts/packages/core/src/user.ts', cast + '\n' + cast);
    assert.equal(run().status, 1, 'another identical occurrence must fail');
    const beforePrune = readFileSync(baselinePath, 'utf8');
    assert.equal(run('--prune').status, 1, 'pruning must reject additional findings');
    assert.equal(readFileSync(baselinePath, 'utf8'), beforePrune);
    write('ts/packages/core/src/user.ts', cast);
    write('python/composio/user.py', 'user = parse_user(external())\n');
    assert.equal(run().status, 1, 'resolved findings must be removed from the baseline');
    assert.equal(run('--prune').status, 0);
    assert.equal(JSON.parse(readFileSync(baselinePath, 'utf8')).length, 7);
    assert.equal(run().status, 0);
    assert.notEqual(run('--update-baseline').status, 0, 'unknown flags must fail');
    write(
      '.github/actions/check/action.yml',
      'runs:\n  steps:\n    # The failure is enforced by a later outcome check.\n    # ast-grep-ignore: yaml-continue-on-error\n    - name: Capture audit\n      continue-on-error: true\n      run: pnpm audit\n'
    );
    assert.ok(!scan(cwd).some(finding => finding.file === '.github/actions/check/action.yml'));
    write('ts/packages/core/src/suppressed.ts', '// Reason\n// ast-grep-ignore\n' + cast);
    assert.ok(scan(cwd).some(finding => finding.ruleId === 'no-suppress-all'));
    write(
      'ts/packages/core/src/suppressed.ts',
      '// Reason\n// ast-grep-ignore: ts-double-assertion\nconst user = parseUser(input);'
    );
    assert.ok(scan(cwd).some(finding => finding.ruleId === 'unused-suppression'));
    write('sgconfig.yml', 'ruleDirs: [missing-rules]\n');
    assert.throws(() => scan(cwd), /ast-grep failed/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
