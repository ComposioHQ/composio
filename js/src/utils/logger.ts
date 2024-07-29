import { getEnvVariable } from './shared';

const levels = {
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DEBUG'
};

const colors = {
  red: (str: string) => `\x1b[31m${str}\x1b[0m`,
  yellow: (str: string) => `\x1b[33m${str}\x1b[0m`,
  blue: (str: string) => `\x1b[34m${str}\x1b[0m`,
  green: (str: string) => `\x1b[32m${str}\x1b[0m`,
  gray: (str: string) => `\x1b[90m${str}\x1b[0m`
};

const colorize = (level: string, timestamp: string) => {
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

const logger = {
  level: getEnvVariable("COMPOSIO_DEBUG", "0") === "1" ? 'debug' : 'info',
  log: (level: string, message: string, meta?: any) => {
    const timestamp = new Date().toLocaleTimeString();
    const { level: coloredLevel, timestamp: coloredTimestamp } = colorize(level, timestamp);
    const metaInfo = meta ? ` - ${JSON.stringify(meta)}` : '';
    console.log(`[${coloredLevel}] ${coloredTimestamp} ${message}${metaInfo}`);
  },
  error: (message: string, meta?: any) => logger.log('error', message, meta),
  warn: (message: string, meta?: any) => logger.log('warn', message, meta),
  info: (message: string, meta?: any) => logger.log('info', message, meta),
  debug: (message: string, meta?: any) => logger.log('debug', message, meta)
};

export default logger;
