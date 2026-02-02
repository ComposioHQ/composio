import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import type { NodeVersionMeta, NodeVersionFromUser, DenoVersionMeta, DenoVersionFromUser, SkipInCI, NonEmptyArray } from './types';

declare module 'bun' {
  interface Env {
    CI?: string;
    COMPOSIO_E2E_NODE_VERSION?: string;
    COMPOSIO_E2E_DENO_VERSION?: string;
  }
}

/**
 * Determine if we're running in a Continuous Integration suite.
 */
export function isCI(): boolean {
  return Boolean(Bun.env.CI);
}

/**
 * Get the repository root path.
 * Computed from the location of this module file.
 */
export function getRepoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // From _utils/src/ to repo root: src -> _utils -> e2e-tests -> ts -> composio
  return resolve(here, '../../../..');
}

/**
 * Resolve the Node.js versions to test against, with CI skip state.
 *
 * The `'current'` version always resolves to the value in `.nvmrc`.
 *
 * In CI mode (CI env var set + COMPOSIO_E2E_NODE_VERSION set):
 * - Versions not matching COMPOSIO_E2E_NODE_VERSION are marked to skip
 *
 * In local mode:
 * - COMPOSIO_E2E_NODE_VERSION overrides everything (single version, no skip)
 * - Otherwise returns all configured versions (no skip)
 */
export function resolveNodeVersionMetaList(
  configNodeVersions?: readonly NodeVersionFromUser[]
): NonEmptyArray<NodeVersionMeta> {
  const envVersion = Bun.env.COMPOSIO_E2E_NODE_VERSION;
  const nvmrcVersion = getNvmrcVersion();

  // Local mode with env override: single version, no skip
  if (!isCI() && envVersion) {
    return [{ kind: 'overridden', value: envVersion, skip: { value: false } }];
  }

  // No config provided: use .nvmrc version
  if (configNodeVersions === undefined || configNodeVersions.length === 0) {
    return [{ kind: 'current', value: nvmrcVersion, skip: { value: false } }];
  }

  const resolvedVersions = configNodeVersions.map((v): NodeVersionMeta => {
    if (v === 'current') {
      return { kind: 'current', value: nvmrcVersion, skip: computeSkipForVersion(envVersion, nvmrcVersion) };
    }
    return { kind: 'static', value: v, skip: computeSkipForVersion(envVersion, v) };
  });

  return resolvedVersions as NonEmptyArray<NodeVersionMeta>;
}

/**
 * Compute skip state for a single version in CI mode.
 */
function computeSkipForVersion(
  envVersion: string | undefined,
  versionValue: string
): SkipInCI {
  if (!isCI() || !envVersion) {
    return { value: false };
  }

  if (versionValue !== envVersion) {
    return {
      value: true,
      reason: `Node ${versionValue} not selected (running ${envVersion})`,
    };
  }

  return { value: false };
}

/**
 * Read the Node.js version from .nvmrc file.
 * Used to determine the version for 'current' tests.
 */
export function getNvmrcVersion(): string {
  try {
    const nvmrc = readFileSync(resolve(getRepoRoot(), '.nvmrc'), 'utf-8');
    return nvmrc.trim();
  } catch {
    console.warn(
      'Failed to read .nvmrc, falling back to current Node.js version (as read by Bun, so its value is unpredictable)',
      process.versions.node
    );
    return process.versions.node;
  }
}

/**
 * Read the Deno version from .dvmrc file.
 * Used to determine the version for 'current' tests.
 *
 * @throws Error if .dvmrc file does not exist
 */
export function getDvmrcVersion(): string {
  try {
    const dvmrc = readFileSync(resolve(getRepoRoot(), '.dvmrc'), 'utf-8');
    return dvmrc.trim();
  } catch {
    throw new Error(
      'Failed to read .dvmrc for Deno version resolution. ' +
        'Create a .dvmrc file at the repo root with the desired Deno version (e.g., "2.6.7").'
    );
  }
}

/**
 * Compute skip state for a Deno version in CI mode.
 */
function computeSkipForDenoVersion(
  envVersion: string | undefined,
  versionValue: string
): SkipInCI {
  if (!isCI() || !envVersion) {
    return { value: false };
  }

  if (versionValue !== envVersion) {
    return {
      value: true,
      reason: `Deno ${versionValue} not selected (running ${envVersion})`,
    };
  }

  return { value: false };
}

/**
 * Resolve the Deno versions to test against, with CI skip state.
 *
 * The `'current'` version always resolves to the value in `.dvmrc`.
 *
 * In CI mode (CI env var set + COMPOSIO_E2E_DENO_VERSION set):
 * - Versions not matching COMPOSIO_E2E_DENO_VERSION are marked to skip
 *
 * In local mode:
 * - COMPOSIO_E2E_DENO_VERSION overrides everything (single version, no skip)
 * - Otherwise returns all configured versions (no skip)
 */
export function resolveDenoVersionMetaList(
  configDenoVersions?: readonly DenoVersionFromUser[]
): NonEmptyArray<DenoVersionMeta> {
  const envVersion = Bun.env.COMPOSIO_E2E_DENO_VERSION;

  // Local mode with env override: single version, no skip
  // Check this BEFORE calling getDvmrcVersion() so env override works without .dvmrc
  if (!isCI() && envVersion) {
    return [{ kind: 'overridden', value: envVersion, skip: { value: false } }];
  }

  // Only read .dvmrc after env override check (getDvmrcVersion throws if file missing)
  const dvmrcVersion = getDvmrcVersion();

  // No config provided: use .dvmrc version
  if (configDenoVersions === undefined || configDenoVersions.length === 0) {
    return [{ kind: 'current', value: dvmrcVersion, skip: { value: false } }];
  }

  const resolvedVersions = configDenoVersions.map((v): DenoVersionMeta => {
    if (v === 'current') {
      return { kind: 'current', value: dvmrcVersion, skip: computeSkipForDenoVersion(envVersion, dvmrcVersion) };
    }
    return { kind: 'static', value: v, skip: computeSkipForDenoVersion(envVersion, v) };
  });

  return resolvedVersions as NonEmptyArray<DenoVersionMeta>;
}

