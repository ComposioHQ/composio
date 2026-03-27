import process from 'node:process';
import { isBackgroundWorkerInvocation, runBackgroundWorkerFromArgv } from 'src/analytics/dispatch';

const TELEMETRY_DEBUG_FLAG = '--telemetry-debug';
const CLI_TELEMETRY_DEBUG_ENV_VAR = 'COMPOSIO_CLI_TELEMETRY_DEBUG';

const stripTelemetryDebugFlag = (argv: ReadonlyArray<string>): string[] => {
  const normalizedArgv = [...argv];
  const flagIndex = normalizedArgv.indexOf(TELEMETRY_DEBUG_FLAG);
  if (flagIndex < 0) {
    return normalizedArgv;
  }

  normalizedArgv.splice(flagIndex, 1);
  process.env[CLI_TELEMETRY_DEBUG_ENV_VAR] = 'true';
  return normalizedArgv;
};

if (isBackgroundWorkerInvocation(process.argv)) {
  void runBackgroundWorkerFromArgv(process.argv).finally(() => {
    process.exit(0);
  });
} else {
  process.argv = stripTelemetryDebugFlag(process.argv);
  void import('./cli-main');
}
