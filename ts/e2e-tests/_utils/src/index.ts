export type {
  E2EConfig,
  E2ETestResult,
  E2ETestResultWithSetup,
  E2ETestResultWithFiles,
  RunFixtureOptions,
  DefineTestsContext,
  NodeVersionMeta as NodeVersion,
  DenoVersionMeta as DenoVersion,
  CliVersionMeta as CliVersion,
  RuntimeVersions,
  RuntimeKind,
  SkipInCI,
} from './types';
export { e2e } from './e2e';
export { sanitizeOutput, parseJsonStdout } from './sanitize';
export { resolveInstallE2EConfig, type InstallE2EConfig } from './config';
export {
  checkDocker,
  ensureInstallImage,
  runInstallContainer,
  type ExecResult,
  type InstallImage,
} from './image-lifecycle';
