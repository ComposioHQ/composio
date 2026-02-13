import { Data, Effect } from 'effect';
import semver from 'semver';

export class CompareSemverError extends Data.TaggedError('services/CompareSemverError')<{
  readonly cause: Error;
  readonly message: string;
}> {}

/**
 * Compare semantic versions. Returns the same -1, 0, 1 number expected by Array.sort's comparator function.
 */
export const semverComparator = (
  version1: string,
  version2: string
): Effect.Effect<number, CompareSemverError, never> =>
  Effect.gen(function* () {
    // Remove version prefix (v, cli@, cli-v) if present
    const v1 = version1.replace(/^(cli-v|cli@|v)/, '');
    const v2 = version2.replace(/^(cli-v|cli@|v)/, '');

    /**
     * Comparison result of `semver.compare(clean1, clean2)`.
     *
     * The return value is one of:
     * - `-1` if `clean1` is less than `clean2`
     * - `0` if `clean1` is equal to `clean2`
     * - `1` if `clean1` is greater than `clean2`
     */
    const comparison = yield* Effect.try({
      try: () => semver.compare(v1, v2),
      catch: error =>
        new CompareSemverError({
          cause: error as Error,
          message: `Failed to compare versions: ${version1} vs ${version2}`,
        }),
    });
    yield* Effect.logDebug(`Comparing versions: ${version1} vs ${version2} -> ${comparison}`);

    return comparison;
  });
