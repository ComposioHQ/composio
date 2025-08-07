import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import {
  detectPlatform,
  UnsupportedPlatformError,
  type PlatformArch,
} from 'src/effects/detect-platform';
import { NodeOs } from 'src/services/node-os';

/**
 * Mock NodeOs service with custom platform and architecture
 */
const createMockNodeOs = <P extends NodeJS.Platform>(platform: P, arch: string) =>
  Layer.succeed(
    NodeOs,
    NodeOs.make({
      homedir: '/mock/home',
      platform: platform as NodeJS.Platform,
      arch,
    })
  );

describe('detect-platform.ts', () => {
  describe('detectPlatform', () => {
    describe('Supported Combinations', () => {
      it.effect('should detect darwin + x64', () =>
        Effect.gen(function* () {
          const result = yield* detectPlatform;

          expect(result).toEqual<PlatformArch>({
            platform: 'darwin',
            arch: 'x64',
          });
        }).pipe(Effect.provide(createMockNodeOs('darwin', 'x64')))
      );

      it.effect('should detect darwin + arm64 (mapped to aarch64)', () =>
        Effect.gen(function* () {
          const result = yield* detectPlatform;

          expect(result).toEqual<PlatformArch>({
            platform: 'darwin',
            arch: 'aarch64',
          });
        }).pipe(Effect.provide(createMockNodeOs('darwin', 'arm64')))
      );

      it.effect('should detect darwin + aarch64', () =>
        Effect.gen(function* () {
          const result = yield* detectPlatform;

          expect(result).toEqual<PlatformArch>({
            platform: 'darwin',
            arch: 'aarch64',
          });
        }).pipe(Effect.provide(createMockNodeOs('darwin', 'aarch64')))
      );

      it.effect('should detect linux + x64', () =>
        Effect.gen(function* () {
          const result = yield* detectPlatform;

          expect(result).toEqual<PlatformArch>({
            platform: 'linux',
            arch: 'x64',
          });
        }).pipe(Effect.provide(createMockNodeOs('linux', 'x64')))
      );

      it.effect('should detect linux + arm64 (mapped to aarch64)', () =>
        Effect.gen(function* () {
          const result = yield* detectPlatform;

          expect(result).toEqual<PlatformArch>({
            platform: 'linux',
            arch: 'aarch64',
          });
        }).pipe(Effect.provide(createMockNodeOs('linux', 'arm64')))
      );

      it.effect('should detect linux + aarch64', () =>
        Effect.gen(function* () {
          const result = yield* detectPlatform;

          expect(result).toEqual<PlatformArch>({
            platform: 'linux',
            arch: 'aarch64',
          });
        }).pipe(Effect.provide(createMockNodeOs('linux', 'aarch64')))
      );
    });

    describe('Unsupported Platforms', () => {
      const unsupportedPlatforms = [
        'win32',
        'freebsd',
        'openbsd',
        'sunos',
        'aix',
        'android',
        'cygwin',
        'netbsd',
      ] as const;

      unsupportedPlatforms.forEach(platform => {
        it.effect(`should fail for unsupported platform: ${platform}`, () =>
          Effect.gen(function* () {
            const result = yield* Effect.flip(detectPlatform);

            expect(result).toBeInstanceOf(UnsupportedPlatformError);
            expect(result.platform).toBe(platform);
            expect(result.arch).toBe('x64');
          }).pipe(Effect.provide(createMockNodeOs(platform, 'x64')))
        );
      });
    });

    describe('Unsupported Architectures', () => {
      const unsupportedArchitectures = [
        'ia32',
        'mips',
        'mipsel',
        'ppc',
        'ppc64',
        's390',
        's390x',
        'loong64',
        'riscv64',
      ];

      unsupportedArchitectures.forEach(arch => {
        it.effect(`should fail for unsupported architecture: ${arch} on darwin`, () =>
          Effect.gen(function* () {
            const result = yield* Effect.flip(detectPlatform);

            expect(result).toBeInstanceOf(UnsupportedPlatformError);
            expect(result.platform).toBe('darwin');
            expect(result.arch).toBe(arch);
          }).pipe(Effect.provide(createMockNodeOs('darwin', arch)))
        );

        it.effect(`should fail for unsupported architecture: ${arch} on linux`, () =>
          Effect.gen(function* () {
            const result = yield* Effect.flip(detectPlatform);

            expect(result).toBeInstanceOf(UnsupportedPlatformError);
            expect(result.platform).toBe('linux');
            expect(result.arch).toBe(arch);
          }).pipe(Effect.provide(createMockNodeOs('linux', arch)))
        );
      });
    });

    describe('Double Unsupported (Platform + Architecture)', () => {
      it.effect('should fail with both unsupported platform and architecture', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('win32');
          expect(result.arch).toBe('ia32');
        }).pipe(Effect.provide(createMockNodeOs('win32', 'ia32')))
      );

      it.effect('should fail with freebsd + mips combination', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('freebsd');
          expect(result.arch).toBe('mips');
        }).pipe(Effect.provide(createMockNodeOs('freebsd', 'mips')))
      );
    });

    describe('Edge Cases', () => {
      it.effect('should handle empty platform string', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('');
          expect(result.arch).toBe('x64');
        }).pipe(Effect.provide(createMockNodeOs('' as NodeJS.Platform, 'x64')))
      );

      it.effect('should handle empty architecture string', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('darwin');
          expect(result.arch).toBe('');
        }).pipe(Effect.provide(createMockNodeOs('darwin', '')))
      );

      it.effect('should handle both empty platform and architecture', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('');
          expect(result.arch).toBe('');
        }).pipe(Effect.provide(createMockNodeOs('' as NodeJS.Platform, '')))
      );

      it.effect('should handle null-like values as strings', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('null');
          expect(result.arch).toBe('undefined');
        }).pipe(Effect.provide(createMockNodeOs('null' as NodeJS.Platform, 'undefined')))
      );

      it.effect('should handle very long platform name', () => {
        const longPlatform = 'a'.repeat(1000);
        return Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe(longPlatform);
          expect(result.arch).toBe('x64');
        }).pipe(Effect.provide(createMockNodeOs(longPlatform as NodeJS.Platform, 'x64')));
      });

      it.effect('should handle very long architecture name', () => {
        const longArch = 'z'.repeat(1000);
        return Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('darwin');
          expect(result.arch).toBe(longArch);
        }).pipe(Effect.provide(createMockNodeOs('darwin', longArch)));
      });
    });

    describe('Case Sensitivity', () => {
      it.effect('should not match Darwin (uppercase D)', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('Darwin');
          expect(result.arch).toBe('x64');
        }).pipe(Effect.provide(createMockNodeOs('Darwin' as NodeJS.Platform, 'x64')))
      );

      it.effect('should not match LINUX (uppercase)', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('LINUX');
          expect(result.arch).toBe('x64');
        }).pipe(Effect.provide(createMockNodeOs('LINUX' as NodeJS.Platform, 'x64')))
      );

      it.effect('should not match X64 (uppercase)', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('darwin');
          expect(result.arch).toBe('X64');
        }).pipe(Effect.provide(createMockNodeOs('darwin', 'X64')))
      );

      it.effect('should not match ARM64 (uppercase)', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('linux');
          expect(result.arch).toBe('ARM64');
        }).pipe(Effect.provide(createMockNodeOs('linux', 'ARM64')))
      );
    });

    describe('Whitespace Handling', () => {
      it.effect('should not match platform with leading whitespace', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe(' darwin');
          expect(result.arch).toBe('x64');
        }).pipe(Effect.provide(createMockNodeOs(' darwin' as NodeJS.Platform, 'x64')))
      );

      it.effect('should not match platform with trailing whitespace', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('linux ');
          expect(result.arch).toBe('x64');
        }).pipe(Effect.provide(createMockNodeOs('linux ' as NodeJS.Platform, 'x64')))
      );

      it.effect('should not match architecture with leading whitespace', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('darwin');
          expect(result.arch).toBe(' x64');
        }).pipe(Effect.provide(createMockNodeOs('darwin', ' x64')))
      );

      it.effect('should not match architecture with trailing whitespace', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('darwin');
          expect(result.arch).toBe('arm64 ');
        }).pipe(Effect.provide(createMockNodeOs('darwin', 'arm64 ')))
      );

      it.effect('should not match with internal whitespace in platform', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('dar win');
          expect(result.arch).toBe('x64');
        }).pipe(Effect.provide(createMockNodeOs('dar win' as NodeJS.Platform, 'x64')))
      );

      it.effect('should not match with internal whitespace in architecture', () =>
        Effect.gen(function* () {
          const result = yield* Effect.flip(detectPlatform);

          expect(result).toBeInstanceOf(UnsupportedPlatformError);
          expect(result.platform).toBe('darwin');
          expect(result.arch).toBe('x 64');
        }).pipe(Effect.provide(createMockNodeOs('darwin', 'x 64')))
      );
    });
  });

  describe('UnsupportedPlatformError', () => {
    it('should be a proper Error instance', () => {
      const error = new UnsupportedPlatformError({ platform: 'test', arch: 'test' });
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UnsupportedPlatformError);
      expect(error._tag).toBe('UnsupportedPlatformError');
    });

    it('should contain platform and arch information', () => {
      const error = new UnsupportedPlatformError({ platform: 'testPlatform', arch: 'testArch' });
      expect(error.platform).toBe('testPlatform');
      expect(error.arch).toBe('testArch');
    });

    it('should maintain properties for empty values', () => {
      const error = new UnsupportedPlatformError({ platform: '', arch: '' });
      expect(error.platform).toBe('');
      expect(error.arch).toBe('');
    });
  });

  describe('Type Tests', () => {
    it('should return correct PlatformArch type for supported combinations', async () => {
      // This test verifies TypeScript types at runtime
      const testType = async (platform: string, arch: string): Promise<PlatformArch> => {
        return await Effect.runPromise(
          detectPlatform.pipe(Effect.provide(createMockNodeOs(platform as NodeJS.Platform, arch)))
        );
      };

      // These calls should compile without TypeScript errors
      await expect(testType('darwin', 'x64')).resolves.toEqual({ platform: 'darwin', arch: 'x64' });
      await expect(testType('darwin', 'arm64')).resolves.toEqual({
        platform: 'darwin',
        arch: 'aarch64',
      });
      await expect(testType('linux', 'aarch64')).resolves.toEqual({
        platform: 'linux',
        arch: 'aarch64',
      });
    });
  });
});
