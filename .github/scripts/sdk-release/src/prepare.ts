import { FileSystem } from '@effect/platform'
import { Effect } from 'effect'
import { resolve } from 'node:path'
import { generateDraft, type ReleaseFacts } from './changelog.ts'
import {
  exec,
  publishablePackages,
  pyVersionFilePath,
  pypiVersionUrl,
  pythonPackage,
  repoRoot,
  urlExists,
} from './shared.ts'

interface Changeset {
  readonly summary: string
  readonly packages: ReadonlyArray<string>
}

const changesetFile = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/
const changesetRelease = /^['"]?(@?[\w./-]+)['"]?\s*:/gm

const readChangesets = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const dir = resolve(repoRoot, '.changeset')
  const entries = yield* fs.readDirectory(dir)
  const changesets: Array<Changeset> = []
  for (const entry of entries.filter((name) => name.endsWith('.md') && name !== 'README.md').sort()) {
    const text = yield* fs.readFileString(resolve(dir, entry))
    const match = text.match(changesetFile)
    if (match === null) continue
    const [, frontmatter = '', body = ''] = match
    const packages = [...frontmatter.matchAll(changesetRelease)].map(([, name]) => name ?? '')
    changesets.push({ summary: body.trim(), packages })
  }
  return changesets
})

/** Keep python/composio/__version__.py in lockstep with pyproject.toml, and report
 * the Python package when its current version is not on PyPI yet. */
const pythonRelease = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const python = yield* pythonPackage
  const versionLine = `__version__ = "${python.version}"\n`
  const current = yield* fs.readFileString(pyVersionFilePath)
  if (current !== versionLine) {
    yield* fs.writeFileString(pyVersionFilePath, versionLine)
    yield* Effect.log(`Synced ${pyVersionFilePath} to ${python.version}`)
  }
  const published = yield* urlExists(pypiVersionUrl(python.name, python.version))
  return published ? null : python
})

/**
 * Apply pending Changesets version bumps, sync the Python version file, and
 * generate the changelog draft for everything the next publish will ship.
 * Designed to run as the changesets/action `version` command, so every file it
 * touches lands in the release PR for human review.
 */
export const prepare = Effect.gen(function* () {
  const changesets = yield* readChangesets
  const before = new Map((yield* publishablePackages).map((pkg) => [pkg.name, pkg.version]))
  if (changesets.length > 0) {
    yield* exec('pnpm', 'changeset', 'version')
  }
  const released = (yield* publishablePackages)
    .filter((pkg) => before.get(pkg.name) !== pkg.version)
    .map((pkg) => ({
      name: pkg.name,
      version: pkg.version,
      summaries: changesets
        .filter((changeset) => changeset.packages.includes(pkg.name))
        .map((changeset) => changeset.summary),
    }))
  const python = yield* pythonRelease
  if (released.length === 0 && python === null) {
    return yield* Effect.log('Nothing to release: no pending changesets and the Python version is already on PyPI.')
  }
  const facts: ReleaseFacts = {
    date: new Date().toISOString().slice(0, 10),
    typescript: released,
    python,
  }
  yield* generateDraft(facts)
})
