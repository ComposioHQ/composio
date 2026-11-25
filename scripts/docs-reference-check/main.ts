import { Buffer } from 'node:buffer';
import { parseArgs } from 'node:util';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Cause, Console, Data, Effect, FileSystem, Path, Stdio } from 'effect';
import type ts from 'typescript6';
import { decodeFenceOptions } from './fences';
import { parsePage, type PageFence } from './pages';
import {
  checkSnippets,
  CompilerError,
  violationAt,
  withoutSuppressions,
  type Snippet,
  type Violation,
} from './policy';
import { formatText, type CheckResult, type OptOut } from './report';

export type { CheckResult } from './report';

export interface CheckOptions {
  readonly packageDir?: string;
  readonly comparePackaged?: boolean;
  readonly compilerOptions?: ts.CompilerOptions;
}

const REPO_ROOT = `${import.meta.dir}/../..`;
const DEFAULT_DIRECTORY = 'docs/content/reference/sdk-reference/typescript';

class UsageError extends Data.TaggedError('UsageError')<{ readonly message: string }> {}

class ReferenceCheckFailed extends Data.TaggedError('ReferenceCheckFailed')<{
  readonly message: string;
}> {}

const packagedViolations = (reference: string, packaged: string, names: readonly string[]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const violations: Violation[] = [];
    const report = (page: string, message: string) =>
      violations.push({
        page,
        line: null,
        className: null,
        section: null,
        method: null,
        rule: 'program',
        message,
      });
    const expected = new Set(names);
    if (yield* fs.exists(path.join(reference, 'meta.json'))) expected.add('meta.json');

    for (const name of expected) {
      const file = path.join(packaged, name);
      if (!(yield* fs.exists(file))) {
        report(file, 'Missing packaged reference');
        continue;
      }
      const source = yield* fs.readFile(path.join(reference, name));
      const shipped = yield* fs.readFile(file);
      if (Buffer.compare(source, shipped) !== 0)
        report(file, 'Packaged reference differs from the repository');
    }
    if (yield* fs.exists(packaged)) {
      for (const name of yield* fs.readDirectory(packaged, { recursive: true })) {
        if (name.endsWith('.mdx') && !expected.has(name)) {
          report(path.join(packaged, name), 'Unexpected packaged reference');
        }
      }
    }
    return violations;
  });

const byPosition = (left: Violation, right: Violation) =>
  (left.page ?? '').localeCompare(right.page ?? '') || (left.line ?? 0) - (right.line ?? 0);

export const checkReferencePages = (directory: string, options: CheckOptions = {}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = path.resolve(directory);
    const cwd = path.resolve();
    const names = (yield* fs.readDirectory(root, { recursive: true }))
      .filter(name => name.endsWith('.mdx'))
      .sort();

    const packageDir = options.packageDir === undefined ? undefined : path.resolve(options.packageDir);
    const violations =
      packageDir === undefined || !options.comparePackaged
        ? []
        : yield* packagedViolations(
            root,
            path.join(packageDir, 'dist/docs/reference/sdk-reference/typescript'),
            names
          );
    const optedOut: OptOut[] = [];
    const snippets: Snippet[] = [];
    let signatures = 0;

    for (const name of names) {
      const file = path.join(root, name);
      const page = path.relative(cwd, file);
      const source = yield* fs.readFileString(file);
      const fences = yield* parsePage(page, source).pipe(
        Effect.catchTag('PageParseError', error => {
          violations.push({
            page: error.page,
            line: error.line,
            className: null,
            section: null,
            method: null,
            rule: 'parse',
            message: error.message,
          });
          return Effect.succeed<ReadonlyArray<PageFence>>([]);
        })
      );
      for (const fence of fences) {
        const mode = yield* decodeFenceOptions(fence.meta).pipe(
          Effect.catchTag('FenceOptionError', error => {
            violations.push(violationAt(fence.location, 'fence-option', error.message));
            return Effect.succeed(null);
          })
        );
        if (mode?._tag === 'Signature') signatures++;
        if (mode?._tag === 'OptedOut') optedOut.push({ ...fence.location, reason: mode.reason });
        if (mode?._tag !== 'Checked') continue;
        const inspected = yield* Effect.try({
          try: () => withoutSuppressions(fence.code, fence.extension),
          catch: cause => new CompilerError({ message: 'Cannot inspect TypeScript fence', cause }),
        });
        for (const line of inspected.lines) {
          violations.push(
            violationAt(
              fence.location,
              'suppression',
              'Diagnostic suppression is not allowed; fix the example or opt it out with nocheck="<reason>".',
              line
            )
          );
        }
        for (const line of inspected.augmentations) {
          violations.push(
            violationAt(
              fence.location,
              'augmentation',
              'Global declarations and module augmentation are not allowed in runnable examples.',
              line
            )
          );
        }
        for (const line of inspected.referencePaths) {
          violations.push(
            violationAt(
              fence.location,
              'reference-path',
              'Use package imports in runnable examples. Triple-slash path references are disallowed.',
              line
            )
          );
        }
        snippets.push({
          location: fence.location,
          extension: fence.extension,
          code:
            inspected.augmentations.length || inspected.referencePaths.length ? '' : inspected.code,
        });
      }
    }

    if (snippets.length === 0) {
      violations.push({
        page: null,
        line: null,
        className: null,
        section: null,
        method: null,
        rule: 'program',
        message: `No checkable TypeScript fences found under ${path.relative(cwd, root) || '.'}`,
      });
    }

    const coreRoot = packageDir ?? path.resolve(REPO_ROOT, 'ts/packages/core');
    violations.push(
      ...(yield* checkSnippets(
        snippets,
        coreRoot,
        options.compilerOptions,
        packageDir === undefined ? 'workspace' : 'built'
      ))
    );
    return {
      checked: snippets.length,
      signatures,
      optedOut,
      violations: violations.toSorted(byPosition),
    } satisfies CheckResult;
  });

const USAGE =
  'Usage: bun scripts/docs-reference-check/main.ts [--json] [--package <dir> [--compare-packaged]] [directory]\n' +
  'Deprecated alias for --package: --installed-package <dir>';

const main = Effect.gen(function* () {
  const args = yield* (yield* Stdio.Stdio).args;
  const { values, positionals } = yield* Effect.try({
    try: () => parseArgs({
      args: [...args],
      allowPositionals: true,
      options: {
        json: { type: 'boolean' },
        package: { type: 'string' },
        // Remove this alias once #5530 lands.
        'installed-package': { type: 'string' },
        'compare-packaged': { type: 'boolean' },
      },
    }),
    catch: cause => new UsageError({ message: `${String(cause)}\n${USAGE}` }),
  });
  const installedPackage = values['installed-package'];
  const packageDir = values.package ?? installedPackage;
  const comparePackaged = values['compare-packaged'] ?? false;
  if (
    positionals.length > 1 ||
    (installedPackage !== undefined && values.package !== undefined) ||
    (comparePackaged && packageDir === undefined)
  ) {
    return yield* new UsageError({ message: USAGE });
  }
  if (installedPackage !== undefined) yield* Console.error('--installed-package is deprecated. Use --package instead.');
  const path = yield* Path.Path;
  const json = values.json ?? false;
  const result = yield* checkReferencePages(positionals[0] ?? path.resolve(REPO_ROOT, DEFAULT_DIRECTORY), {
    packageDir,
    comparePackaged,
  });
  yield* Console.log(json ? JSON.stringify(result, null, 2) : formatText(result));
  if (result.violations.length > 0) {
    return yield* new ReferenceCheckFailed({
      message: `${result.violations.length} violation(s) on the TypeScript reference pages`,
    });
  }
});

if (import.meta.main) {
  BunRuntime.runMain(
    main.pipe(
      Effect.tapCause(cause => Console.error(Cause.pretty(cause))),
      Effect.provide(BunServices.layer)
    ),
    { disableErrorReporting: true }
  );
}
