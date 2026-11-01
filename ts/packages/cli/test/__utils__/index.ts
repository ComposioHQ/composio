import pkg from '../../package.json' with { type: 'json' };

export * as MockConsole from './services/mock-console';
export * as MockTerminal from './services/mock-terminal';
export { TestLayer as TestLive } from './services/test-layer';
export { ToolkitsTest } from './layers/toolkits';
export { ConnectedAccountsTest } from './layers/connected-accounts';
export { CommandRunnerTest } from './layers/command-runner';
export {
  InvocationHooksTest,
  InvocationRecorder,
  recordedInvocationCalls,
  resetInvocationCalls,
  type RecordedInvocationCall,
} from './layers/invocation-hooks';
export { SetupTest } from './layers/setup';
export {
  DashboardToolExecutionTest,
  dashboardProcedureError,
  dashboardProcedureResult,
  type DashboardTestRequest,
} from './layers/dashboard';
export { cli, cliExit } from './cli';
export { exitCodeOf } from './exit-code';
export { pkg };
export { withHttpServer } from './http-server';
export { hostOnlyEnvConfigProvider, liveEnvConfigProvider } from './live-env-config-provider';
