import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import type { NodeVersionMeta, NodeVersionFromUser, SkipInCI } from './types';

declare module 'bun' {
  interface Env {
    CI?: string;
    COMPOSIO_E2E_NODE_VERSION?: string;
  }
}

type NonEmptyArray<T> = [T, ...T[]];

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
 * In CI mode (CI env var set + COMPOSIO_E2E_NODE_VERSION set):
 * - Returns all configured versions, each with skipInCI computed
 * - Versions not matching COMPOSIO_E2E_NODE_VERSION are marked to skip
 * - 'current' versions only run when COMPOSIO_E2E_NODE_VERSION matches .nvmrc
 *
 * In local mode:
 * - COMPOSIO_E2E_NODE_VERSION overrides everything (single version, no skip)
 * - Otherwise returns all configured versions (no skip)
 */
export function resolveNodeVersionMetaList(
  configNodeVersions?: readonly NodeVersionFromUser[]
): NonEmptyArray<NodeVersionMeta> {
  const envVersion = Bun.env.COMPOSIO_E2E_NODE_VERSION;
  const currentNodeVersion = process.versions.node;

  // Local mode with env override: single version, no skip
  if (!isCI() && envVersion) {
    return [{ kind: 'overridden', value: envVersion, skip: { value: false } }];
  }

  // No config provided: use current Node version
  if (configNodeVersions === undefined || configNodeVersions.length === 0) {
    return [{ kind: 'current', value: currentNodeVersion, skip: { value: false } }];
  }

  // Resolve versions with skip state
  const nvmrcVersion = getNvmrcVersion();

  const resolvedVersions = configNodeVersions.map((v): NodeVersionMeta => {
    const isCurrent = v === 'current';
    if (isCurrent) {
      const skip = computeSkipForVersion(envVersion, currentNodeVersion, isCurrent, nvmrcVersion);
      return { kind: 'current', value: currentNodeVersion, skip };
    } else {
      const skip = computeSkipForVersion(envVersion, v, isCurrent, nvmrcVersion);
      return { kind: 'static', value: v, skip };
    }
  });

  return resolvedVersions as NonEmptyArray<NodeVersionMeta>;
}

/**
 * Compute skip state for a single version in CI mode.
 */
function computeSkipForVersion(
  envVersion: string | undefined,
  versionValue: string,
  isCurrent: boolean,
  nvmrcVersion: string
): SkipInCI {
  // Not in CI or no env version: don't skip
  if (!isCI() || !envVersion) {
    return { value: false };
  }

  // 'current' in CI means "run only on .nvmrc version"
  if (isCurrent) {
    if (envVersion !== nvmrcVersion) {
      return {
        value: true,
        reason: `'current' runs only on .nvmrc version ${nvmrcVersion}`,
      };
    }
    return { value: false };
  }

  // Static version: skip if doesn't match env version
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
 * Used in CI to determine which version 'current' tests should run on.
 */
export function getNvmrcVersion(): string {
  try {
    const nvmrc = readFileSync(resolve(getRepoRoot(), '.nvmrc'), 'utf-8');
    return nvmrc.trim();
  } catch {
    console.warn(
      'Failed to read .nvmrc, falling back to current Node version',
      process.versions.node
    );
    return process.versions.node;
  }
}

