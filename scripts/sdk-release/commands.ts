import { spawnSync } from 'node:child_process';

export function runPreparationCommand(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      SDK_RELEASE_TOKEN: undefined,
      GH_TOKEN: undefined,
      GITHUB_TOKEN: undefined,
    },
  });
  if (result.status !== 0)
    throw new Error(
      `${command} failed: ${result.stderr || result.stdout || result.error?.message || result.signal || result.status}`
    );
  return result.stdout;
}
