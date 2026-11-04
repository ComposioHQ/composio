import { Schema } from 'effect';

export const Language = Schema.Literals(['typescript', 'python']);
export type Language = typeof Language.Type;
export const LANGUAGES = Language.literals;

/** Private workspace package whose Changesets version drives the synchronized Python train. */
export const PYTHON_RELEASE_MARKER = '@composio/python-sdk';

export const languageOf = (name: string): Language =>
  name === PYTHON_RELEASE_MARKER ? 'python' : 'typescript';

/** Packages a maintenance release bumps when a language has no recorded change. */
export const PRIMARY_TARGETS: Record<Language, ReadonlyArray<string>> = {
  typescript: ['@composio/core', '@composio/slim'],
  python: [PYTHON_RELEASE_MARKER],
};

/** Registry facts each release lane needs, keyed by language. */
export interface RegistryLane {
  /** GitHub environment that holds the lane's trusted-publisher permission. */
  readonly environment: string;
  /** Audience of the GitHub Actions ID token the registry exchanges for a publish token. */
  readonly oidcAudience: string;
  /** Host that serves the lane's public distribution files. */
  readonly downloadHost: string;
  /** Public metadata URL for one package version. */
  readonly versionUrl: (name: string, version: string) => string;
  /** Label of the lane's rows in the live docs version table. */
  readonly docsLabel: (name: string) => string;
}

export const REGISTRY_LANES: Record<Language, RegistryLane> = {
  typescript: {
    environment: 'npm-release',
    oidcAudience: 'npm:registry.npmjs.org',
    downloadHost: 'registry.npmjs.org',
    versionUrl: (name, version) =>
      `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`,
    docsLabel: name => `TypeScript ${name}`,
  },
  python: {
    environment: 'pypi-release',
    oidcAudience: 'pypi',
    downloadHost: 'files.pythonhosted.org',
    versionUrl: (name, version) => `https://pypi.org/pypi/${name}/${version}/json`,
    docsLabel: () => 'Python composio',
  },
};
