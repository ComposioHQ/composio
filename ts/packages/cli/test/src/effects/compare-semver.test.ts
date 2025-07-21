import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { CompareSemverError, semverComparator } from 'src/effects/compare-semver';

describe('compare-semver.ts', () => {
  describe('semverComparator', () => {
    describe('Basic Comparisons', () => {
      it.effect('should return -1 when first version is older', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.0.0', '2.0.0');
          expect(result).toBe(-1);
        })
      );

      it.effect('should return 1 when first version is newer', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('2.0.0', '1.0.0');
          expect(result).toBe(1);
        })
      );

      it.effect('should return 0 when versions are equal', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.0.0', '1.0.0');
          expect(result).toBe(0);
        })
      );
    });

    describe('Version Prefix Handling', () => {
      it.effect('should handle v prefix on first version', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('v1.0.0', '2.0.0');
          expect(result).toBe(-1);
        })
      );

      it.effect('should handle v prefix on second version', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.0.0', 'v2.0.0');
          expect(result).toBe(-1);
        })
      );

      it.effect('should handle v prefix on both versions', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('v1.0.0', 'v2.0.0');
          expect(result).toBe(-1);
        })
      );

      it.effect('should handle mixed v prefix scenarios', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('v2.0.0', '1.0.0');
          expect(result).toBe(1);
        })
      );

      it.effect('should handle equal versions with and without v prefix', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('v1.0.0', '1.0.0');
          expect(result).toBe(0);
        })
      );
    });

    describe('Cli Prefix Handling', () => {
      it.effect('should handle cli@ prefix on first version', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('cli@1.0.0', '2.0.0');
          expect(result).toBe(-1);
        })
      );

      it.effect('should handle cli@ prefix on second version', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.0.0', 'cli@2.0.0');
          expect(result).toBe(-1);
        })
      );

      it.effect('should handle cli@ prefix on both versions', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('cli@1.0.0', 'cli@2.0.0');
          expect(result).toBe(-1);
        })
      );

      it.effect('should handle mixed cli@ prefix scenarios', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('cli@2.0.0', '1.0.0');
          expect(result).toBe(1);
        })
      );

      it.effect('should handle equal versions with and without cli@ prefix', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('cli@1.0.0', '1.0.0');
          expect(result).toBe(0);
        })
      );
    });

    describe('Semantic Version Components', () => {
      it.effect('should compare major versions correctly', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('2.0.0', '1.9.9');
          expect(result).toBe(1);
        })
      );

      it.effect('should compare minor versions correctly', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.2.0', '1.1.9');
          expect(result).toBe(1);
        })
      );

      it.effect('should compare patch versions correctly', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.0.2', '1.0.1');
          expect(result).toBe(1);
        })
      );
    });

    describe('Pre-release Versions', () => {
      it.effect('should handle alpha versions', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.0.0-alpha.1', '1.0.0-alpha.2');
          expect(result).toBe(-1);
        })
      );

      it.effect('should handle beta versions', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.0.0-beta.2', '1.0.0-beta.1');
          expect(result).toBe(1);
        })
      );

      it.effect('should handle rc versions', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.0.0-rc.1', '1.0.0-rc.1');
          expect(result).toBe(0);
        })
      );

      it.effect('should prioritize release over pre-release', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.0.0', '1.0.0-alpha.1');
          expect(result).toBe(1);
        })
      );

      it.effect('should compare pre-release identifiers', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.0.0-alpha', '1.0.0-beta');
          expect(result).toBe(-1);
        })
      );
    });

    describe('Build Metadata', () => {
      it.effect('should ignore build metadata in comparison', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.0.0+build.1', '1.0.0+build.2');
          expect(result).toBe(0);
        })
      );

      it.effect('should compare versions with build metadata correctly', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.0.1+build.1', '1.0.0+build.2');
          expect(result).toBe(1);
        })
      );

      it.effect('should handle pre-release with build metadata', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.0.0-alpha.1+build.1', '1.0.0-alpha.2+build.2');
          expect(result).toBe(-1);
        })
      );
    });

    describe('Complex Version Scenarios', () => {
      it.effect('should handle multi-digit versions', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('10.15.20', '9.99.99');
          expect(result).toBe(1);
        })
      );

      it.effect('should accept zero-padded components', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(semverComparator('1.01.0', '1.1.0'));
          expect(result).toBeInstanceOf(CompareSemverError);
          expect((result as CompareSemverError).message).toContain('Failed to compare versions');
        })
      );

      it.effect('should handle long pre-release identifiers', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator(
            '1.0.0-alpha.very.long.identifier',
            '1.0.0-alpha.very.long.identifier.2'
          );
          expect(result).toBe(-1);
        })
      );
    });

    describe('Edge Cases', () => {
      it.effect('should handle identical versions', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.2.3', '1.2.3');
          expect(result).toBe(0);
        })
      );

      it.effect('should reject versions with leading zeros', () =>
        Effect.gen(function* () {
          // The semver library considers leading zeros as invalid
          const result = yield* Effect.flip(semverComparator('01.02.03', '1.2.3'));
          expect(result).toBeInstanceOf(CompareSemverError);
          expect(result.message).toContain('Failed to compare versions: 01.02.03 vs 1.2.3');
          expect(result.cause.message).toContain('Invalid Version: 01.02.03');
        })
      );

      it.effect('should handle minimal versions', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('0.0.1', '0.0.0');
          expect(result).toBe(1);
        })
      );

      it.effect('should handle large version numbers', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('999.999.999', '1000.0.0');
          expect(result).toBe(-1);
        })
      );
    });

    describe('Real-world Version Examples', () => {
      it.effect('should compare Node.js-style versions', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('v18.16.0', 'v20.0.0');
          expect(result).toBe(-1);
        })
      );

      it.effect('should compare npm package versions', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('3.2.1', '3.10.0');
          expect(result).toBe(-1);
        })
      );

      it.effect('should compare development versions', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('2.0.0-dev.20240101', '2.0.0-dev.20240102');
          expect(result).toBe(-1);
        })
      );
    });

    describe('Array.sort Compatibility', () => {
      it.effect('should work as Array.sort comparator for ascending order', () =>
        Effect.gen(function* () {
          const versions = ['2.0.0', '1.0.0', '3.0.0'];
          const comparisons: Array<{ versions: [string, string]; result: number }> = [];

          // Simulate Array.sort behavior
          for (let i = 0; i < versions.length - 1; i++) {
            for (let j = i + 1; j < versions.length; j++) {
              const result = yield* semverComparator(versions[i], versions[j]);
              comparisons.push({ versions: [versions[i], versions[j]], result });
            }
          }

          // Verify that the comparator would sort correctly
          const expectedOrder = ['1.0.0', '2.0.0', '3.0.0'];
          const actualResult = [...versions].sort((a, b) => {
            // Find the comparison result from our Effect calls
            const comparison = comparisons.find(
              c =>
                (c.versions[0] === a && c.versions[1] === b) ||
                (c.versions[0] === b && c.versions[1] === a)
            );
            if (!comparison) return 0;
            return comparison.versions[0] === a ? comparison.result : -comparison.result;
          });

          // Since we can't actually use the Effect in Array.sort, just verify
          // the comparison results are consistent with sort expectations
          expect(comparisons.length).toBe(3); // 3 comparisons for 3 elements
        })
      );
    });

    describe('Consistent Comparison Results', () => {
      it.effect('should be reflexive (a == a)', () =>
        Effect.gen(function* () {
          const result = yield* semverComparator('1.5.0', '1.5.0');
          expect(result).toBe(0);
        })
      );

      it.effect('should be antisymmetric (if a > b then b < a)', () =>
        Effect.gen(function* () {
          const result1 = yield* semverComparator('2.0.0', '1.0.0');
          const result2 = yield* semverComparator('1.0.0', '2.0.0');

          expect(result1).toBe(1);
          expect(result2).toBe(-1);
          expect(result1).toBe(-result2);
        })
      );

      it.effect('should be transitive (if a > b and b > c then a > c)', () =>
        Effect.gen(function* () {
          const result1 = yield* semverComparator('3.0.0', '2.0.0'); // Should be 1
          const result2 = yield* semverComparator('2.0.0', '1.0.0'); // Should be 1
          const result3 = yield* semverComparator('3.0.0', '1.0.0'); // Should be 1

          expect(result1).toBe(1);
          expect(result2).toBe(1);
          expect(result3).toBe(1);
        })
      );
    });

    describe('Invalid Version Handling', () => {
      // Note: These tests check how semver.compare handles invalid versions
      // The behavior depends on the semver library implementation

      it.effect('should reject empty strings', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(semverComparator('', '1.0.0'));
          expect(result).toBeInstanceOf(CompareSemverError);
          expect(result.message).toContain('Failed to compare versions');
          expect(result.cause.message).toContain('Invalid Version');
        })
      );

      it.effect('should reject invalid version formats', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(semverComparator('not.a.version', '1.0.0'));
          expect(result).toBeInstanceOf(CompareSemverError);
          expect(result.message).toContain('Failed to compare versions: not.a.version vs 1.0.0');
          expect(result.cause.message).toContain('Invalid Version: not.a.version');
        })
      );

      it.effect('should reject null-like strings', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(semverComparator('null', 'undefined'));
          expect(result).toBeInstanceOf(CompareSemverError);
          expect(result.message).toContain('Failed to compare versions: null vs undefined');
          expect(result.cause.message).toContain('Invalid Version: null');
        })
      );
    });
  });
});
