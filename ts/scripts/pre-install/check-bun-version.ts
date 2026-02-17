#!/usr/bin/env bun

declare module "bun" {
  interface Env {
    /**
     * If set, bypasses the Bun version check.
     * Useful for those CI workflows relying on prebuild environments (e.g., ghcr.io/composiohq/dev-base).
     */
    BYPASS_BUN_VERSION_CHECK: string;
  }
}

/**
 * Check if the installed Bun version matches the required version in .bun-version.
 * Useful for CI workflows relying on the @oven-sh/setup-bun action.
 * 
 * This check is needed because Bun doesn't enforce `.bun-version`, and is ignored by corepack.
 */
async function main() {
  if (Bun.env.BYPASS_BUN_VERSION_CHECK) {
    return;
  }

  const requiredBunVersion = (
    await Bun.file('.bun-version').text()
  ).trim();
  const actualBunVersion = Bun.version.trim();

  if (actualBunVersion != requiredBunVersion) {
    console.error(
      `Bun version mismatch: expected ${requiredBunVersion}, got ${actualBunVersion}.
You can install the required version by running

\`curl -fsSl https://bun.sh/install | bash -s "bun-v${requiredBunVersion}"\`
`,
    );
    process.exit(1);
  }
}

if (import.meta.path === Bun.main) {
  main();
}
