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
