#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '../..');
const references = [
  '.agents/skills/effect-v4/references/cli-surface.md',
  '.agents/skills/cli-command/references/command-example.md',
];

/** Linked excerpts must still occur in the source that the compiler and behavior tests exercise. */
export const checkLinkedExamples = (
  markdown: string,
  readSource: (file: string) => string
): number => {
  const blocks = [
    ...markdown.matchAll(/^```(?:ts|typescript) no-check repo-file=(\S+)\n([\s\S]*?)^```/gm),
  ];
  if (blocks.length === 0) throw new Error('Expected at least one repo-linked TypeScript example');
  for (const [, file, code] of blocks) {
    if (!file || path.isAbsolute(file) || file.split('/').includes('..')) {
      throw new Error(`Invalid example source path: ${file}`);
    }
    const normalize = (text: string) =>
      text
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        .trim();
    if (!code?.trim()) throw new Error(`Empty example from ${file}`);
    if (!normalize(readSource(file)).includes(normalize(code))) {
      throw new Error(`Example differs from ${file}`);
    }
  }
  return blocks.length;
};

if (import.meta.main) {
  let count = 0;
  for (const file of references) {
    count += checkLinkedExamples(readFileSync(path.join(root, file), 'utf8'), source =>
      readFileSync(path.join(root, source), 'utf8')
    );
  }
  console.log(`${count} CLI skill excerpts match repo source`);
  const commands = [
    ['node', '.agents/skills/effect-v4/scripts/check-examples.mjs'],
    ['pnpm', 'exec', 'turbo', 'run', 'typecheck', '--filter=@composio/cli'],
    [
      'pnpm',
      '--filter',
      '@composio/cli',
      'exec',
      'vitest',
      'run',
      'test/skills/command-example.test.ts',
      'test/src/commands/registration.test.ts',
      'test/src/commands/surface.test.ts',
      'test/src/commands/surface.acting-user.test.ts',
      'test/src/invocation/invocation.test.ts',
      'test/src/invocation/command-identity.test.ts',
      'test/src/services/composio-client-singleton.test.ts',
      'test/src/services/terminal-ui.test.ts',
      'test/src/run-main.test.ts',
      'test/src/services/shutdown-signal.test.ts',
      'test/src/commands/triggers/sink-failures.test.ts',
      'test/src/commands/listen/listen.cmd.test.ts',
      'test/src/commands/triggers/triggers.listen.cmd.test.ts',
    ],
    ['pnpm', '--filter', '@composio/cli', 'run', 'lint:effect'],
  ];
  for (const cmd of commands) {
    console.log(`Checking: ${cmd.join(' ')}`);
    const result = Bun.spawnSync(cmd, { cwd: root, stdout: 'inherit', stderr: 'inherit' });
    if (result.exitCode !== 0) process.exit(result.exitCode || 1);
  }
  console.log(
    'CLI skill examples compile and satisfy the selected invocation contracts. Agent task performance is not measured.'
  );
}
