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

function getRequiredBunVersion(): string {
  try {
    return execFileSync('mise', ['current', 'bun'], { encoding: 'utf-8' }).trim();
  } catch (err) {
    console.error(
      `Failed to resolve Bun version from mise.toml.
Install mise and run:

\`mise install\`

Original error: ${(err as Error).message}`
    );
    process.exit(1);
  }
}

function main() {
  if (Bun.env.BYPASS_TOOLCHAIN_CHECK) {
    return;
  }

  const requiredBunVersion = getRequiredBunVersion();
  const actualBunVersion = Bun.version.trim();

  if (actualBunVersion !== requiredBunVersion) {
    console.error(
      `Bun version mismatch: expected ${requiredBunVersion}, got ${actualBunVersion}.
Install the repository toolchain by running:

\`mise install\`
`
    );
    process.exit(1);
  }
}

if (import.meta.path === Bun.main) {
  main();
}
