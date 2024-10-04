import { getEnvVariable } from './shared';

const levels = {
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DEBUG'
} as const;

const colors = {
  red: (str: string) => `\x1b[31m${str}\x1b[0m`,
  yellow: (str: string) => `\x1b[33m${str}\x1b[0m`,
  blue: (str: string) => `\x1b[34m${str}\x1b[0m`,
  green: (str: string) => `\x1b[32m${str}\x1b[0m`,
  gray: (str: string) => `\x1b[90m${str}\x1b[0m`
};

/**
 * Colorize log level and timestamp.
 * @param {string} level - The log level.
 * @param {string} timestamp - The timestamp.
 * @returns {Object} - Object containing colored level and timestamp.
 */
const colorize = (level: keyof typeof levels, timestamp: string): { level: string; timestamp: string } => {
  switch (level) {
    case 'error':
      return { level: colors.red(levels[level]), timestamp: colors.gray(timestamp) };
    case 'warn':
      return { level: colors.yellow(levels[level]), timestamp: colors.gray(timestamp) };
    case 'info':
      return { level: colors.blue(levels[level]), timestamp: colors.gray(timestamp) };
    case 'debug':
      return { level: colors.green(levels[level]), timestamp: colors.gray(timestamp) };
    default:
      return { level, timestamp };
  }
};

/**
 * Get the current log level from environment variables.
 * @returns {string} - The current log level.
 */
const getLogLevel = (): keyof typeof levels => {
  const envLevel = getEnvVariable("COMPOSIO_DEBUG", "0");
  return envLevel === "1" ? 'debug' : 'info';
};

/**
 * Logger utility to log messages with different levels.
 */
const logger = {
  level: getLogLevel(),
  log: (level: keyof typeof levels, message: string, meta?: any): void => {
    const timestamp = new Date().toLocaleString();
    const { level: coloredLevel, timestamp: coloredTimestamp } = colorize(level, timestamp);
    const metaInfo = meta ? ` - ${JSON.stringify(meta)}` : '';
    console.log(`[${coloredLevel}] ${coloredTimestamp} ${message}${metaInfo}`);
  },
  error: (message: string, meta?: any): void => logger.log('error', message, meta),
  warn: (message: string, meta?: any): void => logger.log('warn', message, meta),
  info: (message: string, meta?: any): void => logger.log('info', message, meta),
  debug: (message: string, meta?: any): void => logger.log('debug', message, meta)
};

export default logger;
