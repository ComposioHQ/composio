import pc from 'picocolors';
import { COMPOSIO_LOG_LEVEL } from './constants';
import { redactSensitiveText } from '../telemetry/redact';

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
  const envLevel = (COMPOSIO_LOG_LEVEL ?? 'info')?.toLowerCase();
  return envLevel && envLevel in LOG_LEVELS ? (envLevel as LogLevel) : 'info';
};

/**
 * Destination for SDK log output. Each method receives the already
 * formatted and redacted message as its single argument. `console` satisfies
 * this interface, and so do most structured loggers (pino, winston, ...).
 */
export interface ComposioLogger {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

interface LoggerOptions {
  level?: LogLevel;
  includeTimestamp?: boolean;
  /** Where formatted output is written. Defaults to `console`. */
  sink?: ComposioLogger;
}

export interface LoggerConfigureOptions {
  level?: LogLevel;
  sink?: ComposioLogger;
}

export class Logger {
  private level: LogLevel;
  private readonly includeTimestamp: boolean;
  private sink: ComposioLogger;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? getLogLevel();
    this.includeTimestamp = options.includeTimestamp ?? true;
    this.sink = options.sink ?? console;
  }

  /**
   * Reconfigure the level and/or sink in place. Omitted fields are left
   * unchanged, so `configure({ level: 'debug' })` keeps the current sink.
   */
  configure(options: LoggerConfigureOptions): void {
    if (options.level !== undefined) this.level = options.level;
    if (options.sink !== undefined) this.sink = options.sink;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  private formatMessage(args: unknown[]): string {
    const formattedArgs = args
      .map((arg, index) => {
        if (typeof arg === 'object') {
          return JSON.stringify(arg);
        } else {
          if (index === 0) {
            if (args.length > 1) {
              return pc.yellow(`${arg}`);
            } else {
              return String(arg);
            }
          }
          return String(arg);
        }
      })
      .join('\n');

    const redactedArgs = redactSensitiveText(formattedArgs) ?? formattedArgs;

    if (!this.includeTimestamp) return redactedArgs;

    const timestamp = new Date().toISOString();
    return `${pc.gray(timestamp)} - ${redactedArgs}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  error(...args: unknown[]): void {
    if (this.shouldLog('error')) {
      this.sink.error(this.formatMessage(args));
    }
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      this.sink.warn(this.formatMessage(args));
    }
  }

  info(...args: unknown[]): void {
    if (this.shouldLog('info')) {
      this.sink.info(this.formatMessage(args));
    }
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      this.sink.debug(this.formatMessage(args));
    }
  }
}

// Create and export a default logger instance
const logger = new Logger();
export default logger;
