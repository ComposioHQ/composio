import winston from 'winston';
import colors from 'colors';
import { getEnvVariable } from './shared';

const colorize = winston.format((info) => {
  switch (info.level) {
    case 'error':
      info.level = colors.red(info.level.toUpperCase());
      break;
    case 'warn':
      info.level = colors.yellow(info.level.toUpperCase());
      break;
    case 'info':
      info.level = colors.blue(info.level.toUpperCase());
      break;
    case 'debug':
      info.level = colors.green(info.level.toUpperCase());
      break;
    default:
      break;
  }
  info.timestamp = colors.gray(info.timestamp);
  return info;
});

const logger = winston.createLogger({
  level: getEnvVariable("COMPOSIO_DEBUG", "0") === "1" ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    colorize(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `[${level}] ${timestamp} ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ],
});

export default logger;
