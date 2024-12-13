import { getEnvVariable } from "./shared";
import winston from "winston";

// Define log levels with corresponding priorities
const LOG_LEVELS = {
  error: 0, // Highest priority - critical errors
  warn: 1, // Warning messages
  info: 2, // General information
  debug: 3, // Debug information
} as const;

// Define colors for each log level for better visibility
const LOG_COLORS = {
  error: "red", // Critical errors in red
  warn: "yellow", // Warnings in yellow
  info: "blue", // Info in blue
  debug: "green", // Debug in green
};

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

// Configure winston colors
winston.addColors(LOG_COLORS);

// Create custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    // Format timestamp for readability
    const formattedTime = timestamp.slice(5, 22).replace("T", " ");

    // Handle metadata serialization
    let metadataStr = "";
    if (Object.keys(metadata).length) {
      try {
        metadataStr = ` - ${JSON.stringify(metadata)}`;
      } catch {
        metadataStr = " - [Circular metadata object]";
      }
    }

    return `[${level}]: ${formattedTime} - ${message}${metadataStr}`;
  })
);

// Create and configure logger instance
const logger = winston.createLogger({
  // This can be overridden by the user by setting the COMPOSIO_LOGGING_LEVEL environment variable
  // Only this or higher priority logs will be shown
  level: getLogLevel(),
  levels: LOG_LEVELS,
  format: logFormat,
  transports: [
    new winston.transports.Console({
      handleExceptions: false,
      handleRejections: false,
    }),
  ],
  exitOnError: false, // Prevent crashes on uncaught exceptions
});

export default logger;
