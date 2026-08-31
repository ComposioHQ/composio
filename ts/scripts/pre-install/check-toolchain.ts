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

function getBunVersion(requiredVersion: string): string {
  if (!requiredVersion.includes('+')) {
    return Bun.version.trim();
  }

  // `Bun.version_with_sha` ("v1.4.1-canary.1 (d9b769812)") carries the same revision that
  // `bun --revision` prints ("1.4.1-canary.1+d9b769812") without spawning a second Bun process.
  const match = Bun.version_with_sha.match(/^v(\S+) \(([0-9a-f]+)\)$/);
  if (!match) {
    console.error(
      `Failed to resolve the installed Bun revision from "${Bun.version_with_sha}".
Install the repository toolchain by running:

\`mise install\`
`
    );
    process.exit(1);
  }
  return `${match[1]}+${match[2]}`;
}

function assertVersion(tool: CheckedTool, getActualVersion: (requiredVersion: string) => string) {
  const requiredVersion = getRequiredVersion(tool);
  const actualVersion = getActualVersion(requiredVersion);

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

  assertVersion('bun', getBunVersion);
  assertVersion('pnpm', getPnpmVersion);
}

if (import.meta.path === Bun.main) {
  main();
}
