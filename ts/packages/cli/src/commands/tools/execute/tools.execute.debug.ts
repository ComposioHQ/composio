import { makePerfDebugLogger } from 'src/services/runtime-debug-logger';

// One logger for the whole command, so every perf line measures from the same start.
export const perfDebugLog = makePerfDebugLogger();
