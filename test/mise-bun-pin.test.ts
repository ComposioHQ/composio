#!/usr/bin/env bun

/**
 * Asserts that the Bun revision declared in `mise.toml` matches the binary mise
 * actually installs.
 *
 * `[tool_alias] bun = "http:bun"` decouples the version label from the tarball
 * URLs, and mise never cross-checks the two: the per-platform checksums prove a
 * tarball is the one we named, not that it contains the revision we claimed. So
 * bumping the URLs without the `version` string (or the reverse) silently ships
 * the wrong Bun to every contributor and every CI job. This is the only check
 * that catches that.
 *
 * The binary is resolved through `mise which bun` rather than `$PATH`, so a
 * contributor running their own Bun does not get a spurious failure. When mise
 * cannot resolve Bun the check skips locally, but fails under CI, where the
 * toolchain is installed by `.github/actions/setup-node-pnpm-bun`.
 */

import { execFileSync } from 'node:child_process';

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function skipOrFail(reason: string) {
  if (process.env.CI) {
    console.error(
      `mise-bun-pin: ${reason}
CI must run under the mise-installed toolchain, so this is a failure here.`
    );
    process.exit(1);
  }

  console.log(
    `mise-bun-pin: skipped (${reason}).
Run \`mise install\` to enable this check locally.`
  );
  process.exit(0);
}

function main() {
  let declaredRevision: string;
  let bunPath: string;

  try {
    declaredRevision = run('mise', ['current', 'bun']);
    bunPath = run('mise', ['which', 'bun']);
  } catch (err) {
    skipOrFail(`could not resolve Bun from mise (${(err as Error).message})`);
    return;
  }

  const installedRevision = run(bunPath, ['--revision']);

  if (installedRevision !== declaredRevision) {
    console.error(
      `Bun revision mismatch between mise.toml and the installed binary.

  mise.toml declares: ${declaredRevision}
  ${bunPath} is:      ${installedRevision}

The \`version\` under [tools.bun] and the per-platform tarball URLs are set
independently. Update whichever one is stale, then run \`mise install\`.`
    );
    process.exit(1);
  }

  console.log(`mise-bun-pin: ok (${installedRevision})`);
}

main();
