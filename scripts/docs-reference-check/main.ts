import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Cause, Console, Data, Effect, FileSystem, Path, Stdio } from 'effect';
import type ts from 'typescript6';
import { decodeFenceOptions } from './fences';
import { parsePage, type PageFence } from './pages';
import {
  checkSnippets,
  violationAt,
  withoutBlanketSuppressions,
  type Snippet,
  type Violation,
} from './policy';
import { formatText, type CheckResult, type OptOut } from './report';

export type { CheckResult } from './report';

export interface CheckOptions {
  readonly compilerOptions?: ts.CompilerOptions;
}

const REPO_ROOT = `${import.meta.dir}/../..`;
const DEFAULT_DIRECTORY = 'docs/content/reference/sdk-reference/typescript';

class UsageError extends Data.TaggedError('UsageError')<{ readonly message: string }> {}

class ReferenceCheckFailed extends Data.TaggedError('ReferenceCheckFailed')<{
  readonly message: string;
}> {}

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

    const violations: Violation[] = [];
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
        const { code, lines } = withoutBlanketSuppressions(fence.code, fence.extension);
        for (const line of lines) {
          violations.push(
            violationAt(
              fence.location,
              'suppression',
              'Blanket diagnostic suppression is not allowed; fix the example or opt it out with nocheck="<reason>".',
              line
            )
          );
        }
        snippets.push({ location: fence.location, extension: fence.extension, code });
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

    const coreRoot = path.resolve(REPO_ROOT, 'ts/packages/core');
    violations.push(...(yield* checkSnippets(snippets, coreRoot, options.compilerOptions)));
    return {
      checked: snippets.length,
      signatures,
      optedOut,
      violations: violations.toSorted(byPosition),
    } satisfies CheckResult;
  });

const USAGE = 'Usage: bun scripts/docs-reference-check/main.ts [--json] [directory]';

const main = Effect.gen(function* () {
  const args = yield* (yield* Stdio.Stdio).args;
  const json = args.includes('--json');
  const rest = args.filter(arg => arg !== '--json');
  if (rest.length > 1 || rest.some(arg => arg.startsWith('-'))) {
    return yield* new UsageError({ message: USAGE });
  }
  const path = yield* Path.Path;
  const result = yield* checkReferencePages(rest[0] ?? path.resolve(REPO_ROOT, DEFAULT_DIRECTORY));
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
