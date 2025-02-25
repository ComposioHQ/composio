import { getEnvVariable } from "./shared";

// Define log levels with corresponding priorities
export const LOG_LEVELS = {
  silent: -1, // No logs
  error: 0, // Highest priority - critical errors
  warn: 1, // Warning messages
  info: 2, // General information
  debug: 3, // Debug information
} as const;

/**
 * Get the current log level from environment variables.
 * Defaults to 'info' if not set or invalid.
 * @returns {keyof typeof LOG_LEVELS} The current log level
 */
export const getLogLevel = (): keyof typeof LOG_LEVELS => {
  const envLevel = getEnvVariable(
    "COMPOSIO_LOGGING_LEVEL",
    "info"
  )?.toLowerCase();
  return envLevel && envLevel in LOG_LEVELS
    ? (envLevel as keyof typeof LOG_LEVELS)
    : "info";
};

const addTimestampToMessage = (message: string): string => {
  const timestamp = new Date().toISOString();
  return `${timestamp} - ${message}`;
};

const formatErrorMessage = (args: unknown[]): string => {
  return args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : arg))
    .join(" ");
};

const getLogger = () => {
  const logger = console;
  const loggingLevel = getLogLevel();
  const logLevelValue = LOG_LEVELS[loggingLevel];
  const noop = () => {};

  return {
    error:
      logLevelValue >= LOG_LEVELS.error
        ? (...args: unknown[]) =>
            logger.error(addTimestampToMessage(formatErrorMessage(args)))
        : noop,
    warn:
      logLevelValue >= LOG_LEVELS.warn
        ? (...args: unknown[]) =>
            logger.warn(addTimestampToMessage(formatErrorMessage(args)))
        : noop,
    info:
      logLevelValue >= LOG_LEVELS.info
        ? (...args: unknown[]) =>
            logger.info(addTimestampToMessage(formatErrorMessage(args)))
        : noop,
    debug:
      logLevelValue >= LOG_LEVELS.debug
        ? (...args: unknown[]) =>
            logger.debug(addTimestampToMessage(formatErrorMessage(args)))
        : noop,
  };
};

export default getLogger();
