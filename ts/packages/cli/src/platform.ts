/**
 * Centralized platform layer exports.
 *
 * Both `@effect/platform-bun` and `@effect/platform-node` are thin wrappers
 * around `@effect/platform-node-shared`. The APIs are identical — only the
 * import paths and symbol names differ. By re-exporting from a single module,
 * a future platform change only requires editing this file.
 */
export {
  NodeContext as PlatformContext,
  NodeRuntime as PlatformRuntime,
  NodeFileSystem as PlatformFileSystem,
} from '@effect/platform-node';
