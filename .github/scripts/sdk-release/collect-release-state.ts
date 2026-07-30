import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { assertCanStartFromDurableStates, parseDurableReleaseStates } from './state';

const RepositorySchema = z.string().regex(/^[^/\s]+\/[^/\s]+$/);
const SearchPagesSchema = z.array(
  z.object({ items: z.array(z.object({ number: z.number().int().positive() }).passthrough()) })
);

type CommandRunner = (command: string, args: string[]) => string;

function commandOutput(command: string, args: string[]): string {
  const result = Bun.spawnSync([command, ...args]);
  if (result.exitCode !== 0) {
    const detail = new TextDecoder().decode(result.stderr).trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

export function collectDurableReleaseComments(
  repository: string,
  run: CommandRunner = commandOutput
): unknown[] {
  const checkedRepository = RepositorySchema.parse(repository);
  const search = SearchPagesSchema.parse(
    JSON.parse(
      run('gh', [
        'api',
        '-X',
        'GET',
        'search/issues',
        '-f',
        `q=repo:${checkedRepository} is:pr in:comments "SDK release receipt index"`,
        '-f',
        'per_page=100',
        '--paginate',
        '--slurp',
      ])
    )
  );
  const pullRequests = [
    ...new Set(search.flatMap(page => page.items.map(item => item.number))),
  ].sort((left, right) => left - right);
  if (pullRequests.length > 100) {
    throw new Error('More than 100 release receipt PRs require explicit state compaction');
  }
  return pullRequests.flatMap(number => {
    const pages = z
      .array(z.array(z.unknown()))
      .parse(
        JSON.parse(
          run('gh', [
            'api',
            `repos/${checkedRepository}/issues/${number}/comments`,
            '--paginate',
            '--slurp',
          ])
        )
      );
    return pages.flat();
  });
}

function argumentValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main(args: string[]): Promise<void> {
  const repository = argumentValue(args, '--repository');
  const requestedRelease = argumentValue(args, '--release-id');
  const trustedLogin = argumentValue(args, '--trusted-login');
  const states = parseDurableReleaseStates(collectDurableReleaseComments(repository), trustedLogin);
  assertCanStartFromDurableStates(states, requestedRelease);
  writeFileSync(argumentValue(args, '--output'), `${JSON.stringify({ states }, null, 2)}\n`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
