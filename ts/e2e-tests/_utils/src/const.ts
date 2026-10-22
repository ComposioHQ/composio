import toolchainVersions from '../../../../toolchain-versions.json' with { type: 'json' };

/**
 * Environment variables to automatically pass through to Docker containers.
 */
export const WELL_KNOWN_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'COMPOSIO_API_KEY',
  'COMPOSIO_BASE_URL',
  'OPENAI_API_KEY',
] as const;

/**
 * Node.js versions that are well-known to the CI matrix strategy.
 * `current` refers to the Node.js version specified in mise.toml.
 */
export const WELL_KNOWN_NODE_VERSIONS = [...toolchainVersions.node, 'current'] as const;

/**
 * Returns the sha256 digest pinned for a Node.js version in toolchain-versions.json.
 * Throws when the version has no pinned digest, so an unpinned image build fails
 * loudly instead of silently floating on a mutable base image tag.
 */
export function nodeDigestFor(nodeVersion: string): string {
  const digests = toolchainVersions.nodeDigests as Record<string, string>;
  const digest = digests[nodeVersion];
  if (!digest) {
    throw new Error(
      `No digest pin found for Node.js ${nodeVersion} in toolchain-versions.json (nodeDigests). ` +
        'Add a digest pin for this version, or builds would float on an untagged base image.'
    );
  }
  return digest;
}

/**
 * CLI versions that are well-known to the CI strategy.
 * `current` refers to the version in ts/packages/cli/package.json.
 */
export const WELL_KNOWN_CLI_VERSIONS = ['current'] as const;

export const INSTALL_E2E_SHELLS = ['bash', 'zsh', 'fish'] as const;

export const INSTALL_E2E_MODES = ['local', 'prod'] as const;

export const INSTALL_E2E_LOCAL_RELEASE_TAG = '@composio/cli@98.0.0';

export const TIMEOUTS = {
  DEFAULT: 5_000,
  FIXTURE: 120_000,
  LLM_SHORT: 30_000,
  LLM_LONG: 60_000,
} as const;
