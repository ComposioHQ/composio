#!/usr/bin/env bun

import { execFileSync } from 'node:child_process';

declare module 'bun' {
  interface Env {
    /**
     * If set, bypasses the local toolchain check.
     * Useful for CI workflows relying on prebuilt environments.
     */
    BYPASS_TOOLCHAIN_CHECK: string;
  }
}

type CheckedTool = 'bun' | 'pnpm';

const miseTool: Record<CheckedTool, string> = {
  bun: 'bun',
  pnpm: 'npm:pnpm',
};

function getRequiredVersion(tool: CheckedTool): string {
  try {
    return execFileSync('mise', ['current', miseTool[tool]], { encoding: 'utf-8' }).trim();
  } catch (err) {
    console.error(
      `Failed to resolve ${tool} version from mise.toml.
Install mise and run:

\`mise install\`

Original error: ${(err as Error).message}`
    );
    process.exit(1);
  }
}

function getPnpmVersion(): string {
  try {
    return execFileSync('pnpm', ['--version'], { encoding: 'utf-8' }).trim();
  } catch (err) {
    console.error(
      `Failed to resolve pnpm version.
Install the repository toolchain by running:

\`mise install\`

Original error: ${(err as Error).message}`
    );
    process.exit(1);
  }
}

function assertVersion(tool: CheckedTool, actualVersion: string) {
  const requiredVersion = getRequiredVersion(tool);

  if (actualVersion !== requiredVersion) {
    console.error(
      `${tool} version mismatch: expected ${requiredVersion}, got ${actualVersion}.
Install the repository toolchain by running:

\`mise install\`
`
    );
    process.exit(1);
  }
}

function main() {
  if (Bun.env.BYPASS_TOOLCHAIN_CHECK) {
    return;
  }

  assertVersion('bun', Bun.version.trim());
  assertVersion('pnpm', getPnpmVersion());
}

if (import.meta.path === Bun.main) {
  main();
}
