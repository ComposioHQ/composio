import chalk from 'chalk';
import { getEnvVariable } from './env';

// Define log levels with corresponding priorities
export const LOG_LEVELS = {
  silent: -1, // No logs
  error: 0, // Highest priority - critical errors
  warn: 1, // Warning messages
  info: 2, // General information
  debug: 3, // Debug information
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;

/**
 * Get the current log level from environment variables.
 * Defaults to 'info' if not set or invalid.
 * @returns {LogLevel} The current log level
 */
export const getLogLevel = (): LogLevel => {
  const envLevel = getEnvVariable('COMPOSIO_LOG_LEVEL', 'info')?.toLowerCase();
  return envLevel && envLevel in LOG_LEVELS ? (envLevel as LogLevel) : 'info';
};

interface LoggerOptions {
  level?: LogLevel;
  includeTimestamp?: boolean;
}

class Logger {
  private readonly level: LogLevel;
  private readonly includeTimestamp: boolean;
  private readonly console: Console;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? getLogLevel();
    this.includeTimestamp = options.includeTimestamp ?? true;
    this.console = console;
  }

  private formatMessage(args: unknown[]): string {
    const formattedArgs = args
      .map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
      .join('\n');

    if (!this.includeTimestamp) {
      return formattedArgs;
    }

    const timestamp = new Date().toISOString();
    return `${chalk.gray(timestamp)} - ${formattedArgs}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  error(...args: unknown[]): void {
    if (this.shouldLog('error')) {
      this.console.error(this.formatMessage(args));
    }
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      this.console.warn(this.formatMessage(args));
    }
  }

  info(...args: unknown[]): void {
    if (this.shouldLog('info')) {
      this.console.info(this.formatMessage(args));
    }
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      this.console.debug(this.formatMessage(args));
    }
  }
}

// Create and export a default logger instance
const logger = new Logger();
export default logger;
