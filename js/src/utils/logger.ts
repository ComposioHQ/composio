import { getEnvVariable } from './shared';
import winston from 'winston';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
} as const;

const colors = {
  error: 'red',
  warn: 'yellow', 
  info: 'blue',
  debug: 'green'
};

/**
 * Get the current log level from environment variables.
 * @returns {keyof typeof levels} - The current log level.
 */
const getLogLevel = (): keyof typeof levels => {
  const envLevel = getEnvVariable("COMPOSIO_LOGGING_LEVEL", "info");
  if (!envLevel || !(envLevel in levels)) {
    return 'info'; // Default to info instead of warn to match default param
  }
  return envLevel as keyof typeof levels;
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp(),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaString = '';
    if (Object.keys(meta).length) {
      try {
        metaString = ` - ${JSON.stringify(meta)}`;
      } catch (err) {
        metaString = ` - [Meta object contains circular reference]`;
      }
    }
    const parsedTimestamp = timestamp.slice(0, 19).replace('T', ' ');
    return `[${level}] : ${parsedTimestamp} - ${message}${metaString}`;
  })
);

const logger = winston.createLogger({
  level: getLogLevel(),
  levels,
  format,
  transports: [
    new winston.transports.Console()
  ]
});

export default logger;
