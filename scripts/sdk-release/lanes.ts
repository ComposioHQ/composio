import { Schema } from 'effect';
import { pythonVersion } from './channel';

export const Language = Schema.Literals(['typescript', 'python']);
export type Language = typeof Language.Type;
export const LANGUAGES = Language.literals;
export const NPM_REGISTRY = 'https://registry.npmjs.org';

/** Private workspace package whose Changesets version drives the synchronized Python train. */
export const PYTHON_RELEASE_MARKER = '@composio/python-sdk';

export const languageOf = (name: string): Language =>
  name === PYTHON_RELEASE_MARKER ? 'python' : 'typescript';

/** Packages a maintenance release bumps when a language has no recorded change. */
export const PRIMARY_TARGETS: Record<Language, ReadonlyArray<string>> = {
  typescript: ['@composio/core', '@composio/slim'],
  python: [PYTHON_RELEASE_MARKER],
};

/** How each language's registry spells a planned version. */
export const REGISTRY_VERSION: Record<Language, (version: string) => string> = {
  typescript: version => version,
  python: pythonVersion,
};

/** Where each language's registry serves metadata and files. */
export const REGISTRY_LANES: Record<
  Language,
  {
    /** Host that serves the lane's public distribution files. */
    readonly downloadHost: string;
    /** Public metadata URL for one package version. */
    readonly versionUrl: (name: string, version: string) => string;
  }
> = {
  typescript: {
    downloadHost: 'registry.npmjs.org',
    versionUrl: (name, version) => `${NPM_REGISTRY}/${encodeURIComponent(name)}/${version}`,
  },
  python: {
    downloadHost: 'files.pythonhosted.org',
    versionUrl: (name, version) => `https://pypi.org/pypi/${name}/${version}/json`,
  },
};
