// Extend the Error interface to include errorId
declare global {
  interface Error {
    errorId?: string;
  }
}

import { ComposioError as ComposioClientError } from '@composio/client';
import { TELEMETRY_EVENTS, TelemetryMetadata } from '../types/telemetry.types';
import { getEnvVariable } from '../utils/env';
import { BatchProcessor } from './BatchProcessor';
import { ComposioError } from '../errors/ComposioError';
import { getRandomUUID } from '../utils/uuid';
import {
  TelemetryMetricPayloadBody,
  TelemetryMetricSource,
  TelemetryPayload,
} from '../services/telemetry/TelemetryService.types';
import { TelemetryService } from '../services/telemetry/TelemetryService';
import logger from '../utils/logger';
/**
 * The Telemetry class is used to log the telemetry for any given instance which extends InstrumentedInstance.
 *
 * This class is used to instrument the telemetry for the given instance and send the telemetry to the server.
 * This class is also used to create a global error handler for the given instance.
 *
 * @example
 *
 * const telemetry = new Telemetry({...});
 * const composio = new Composio({...})
 *
 * telemetry.instrument(composio);
 * telemetry.instrument(composio.tools);
 * telemetry.instrument(composio.toolkits);
 * telemetry.instrument(composio.triggers);
 *
 */
export class TelemetryTransport {
  private telemetryMetadata!: TelemetryMetadata;
  private isTelemetryDisabled: boolean = true;
  private telemetrySource!: TelemetryMetricSource;
  private readonly telemetrySourceName = 'typescript-sdk';
  private readonly telemetryServiceName = 'sdk';
  private readonly telemetryLanguage = 'typescript';
  private exitHandlersRegistered = false;

  private batchProcessor = new BatchProcessor(200, 10, async (data: TelemetryMetricPayloadBody) => {
    logger.debug('Sending batch of telemetry metrics', data);
    await TelemetryService.sendMetric(data as TelemetryPayload[]);
  });

  setup(metadata: TelemetryMetadata) {
    this.telemetryMetadata = metadata;
    this.isTelemetryDisabled = false;
    this.telemetrySource = {
      host: this.telemetryMetadata?.host ?? this.telemetrySourceName,
      service: this.telemetryServiceName,
      language: this.telemetryLanguage,
      version: this.telemetryMetadata?.version,
      platform: this.telemetryMetadata?.isBrowser ? 'browser' : 'node',
      environment: getEnvVariable('NODE_ENV', 'production') as TelemetryMetricSource['environment'],
    };
    // Register exit handlers to automatically flush telemetry before process exit
    this.registerExitHandlers();

    // send telemetry event for SDK initialization
    this.sendMetric([
      {
        functionName: TELEMETRY_EVENTS.SDK_INITIALIZED,
        durationMs: 0,
        timestamp: Date.now() / 1000,
        props: {},
        source: this.telemetrySource,
        metadata: {
          provider: this.telemetryMetadata?.provider ?? 'openai',
        },
        error: undefined,
      },
    ]);
  }

  /**
   * Instrument the telemetry for the given instance.
   *
   * You can pass the instance and the file name of the instance to instrument the telemetry.
   * This will instrument all the methods of the instance and log the telemetry for each method call.
   * @param instance - any instance that extends InstrumentedInstance
   * @param fileName - the file name of the instance
   * @returns
   */
  instrument<T extends object>(instance: T, fileName?: string) {
    const proto = Object.getPrototypeOf(instance);
    const methodNames = Object.getOwnPropertyNames(proto).filter(key => {
      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      return (
        key !== 'constructor' &&
        descriptor &&
        typeof descriptor.value === 'function' &&
        descriptor.value.constructor.name === 'AsyncFunction'
      );
    });
    // prioritize the explicitly passed class name, then fall back to constructor name, then 'unknown'
    const instrumentedClassName = fileName ?? instance.constructor?.name ?? 'unknown';

    for (const name of methodNames) {
      const originalMethod = (instance as unknown as Record<string, Function>)[name] as (
        ...args: unknown[]
      ) => Promise<unknown>;

      (instance as unknown as Record<string, Function>)[name] = async (...args: unknown[]) => {
        // Check telemetry status once at the start to ensure consistent behavior
        const telemetryEnabled = this.shouldSendTelemetry();
        const startTime = telemetryEnabled ? Date.now() : undefined;

        try {
          const result = await originalMethod.apply(instance, args);

          // Only collect telemetry if setup() has been called (telemetry is enabled)
          if (telemetryEnabled && startTime !== undefined) {
            const durationMs = Date.now() - startTime;
            const telemetryPayload: TelemetryPayload = {
              functionName: `${instrumentedClassName}.${name}`,
              durationMs,
              timestamp: startTime / 1000,
              props: {
                fileName: instrumentedClassName,
                method: name,
                params: args,
              },
              metadata: {
                provider: this.telemetryMetadata?.provider ?? 'openai',
              },
              error: undefined,
              source: this.telemetrySource,
            };

            this.batchProcessor.pushItem(telemetryPayload);
          }

          return result;
        } catch (error) {
          if (error instanceof Error) {
            if (!error.errorId) {
              error.errorId = getRandomUUID();
              // Only send error telemetry if telemetry is enabled
              if (telemetryEnabled && startTime !== undefined) {
                const durationMs = Date.now() - startTime;
                await this.prepareAndSendErrorTelemetry(
                  error,
                  instrumentedClassName,
                  name,
                  args,
                  startTime,
                  durationMs
                );
              }
            }
          }
          throw error;
        }
      };
    }

    return instance;
  }

  /**
   * Check if the telemetry should be sent.
   * @returns true if the telemetry should be sent, false otherwise
   */
  private shouldSendTelemetry() {
    const telemetryDisabledEnvironments = ['test', 'ci'];
    const nodeEnv = (getEnvVariable('NODE_ENV', 'development') || '').toLowerCase();
    const isDisabledEnvironment = telemetryDisabledEnvironments.includes(nodeEnv);
    const isTelemetryDisabledByEnv = getEnvVariable('TELEMETRY_DISABLED', 'false') === 'true';

    return !this.isTelemetryDisabled && !isTelemetryDisabledByEnv && !isDisabledEnvironment;
  }

  /**
   * Prepare and send the error telemetry.
   *
   * @TODO This currently blocks the thread and sends the telemetry to the server.
   *
   * @param {unknown} error - The error to send.
   * @param {string} instrumentedClassName - The class name of the instrumented class.
   * @param {string} name - The name of the method that threw the error.
   * @param {unknown[]} args - The arguments passed to the method.
   * @param {number} startTime - The start time of the method invocation in milliseconds.
   * @param {number} durationMs - The duration of the method invocation in milliseconds.
   */
  private async prepareAndSendErrorTelemetry(
    error: unknown,
    instrumentedClassName: string,
    name: string,
    args: unknown[],
    startTime: number,
    durationMs: number
  ) {
    const telemetryPayload: TelemetryPayload = {
      functionName: `${instrumentedClassName}.${name}`,
      durationMs,
      timestamp: startTime / 1000,
      props: {
        fileName: instrumentedClassName,
        method: name,
        params: args,
      },
      metadata: {
        provider: this.telemetryMetadata?.provider ?? 'openai',
      },
      source: this.telemetrySource,
    };
    // client error, this is likely handled by the API itseld
    if (error instanceof ComposioClientError) {
      telemetryPayload.error = {
        errorId: error.errorId,
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error instanceof ComposioError) {
      telemetryPayload.error = {
        errorId: error.errorId,
        name: error.name,
        code: error.code,
        message: error.message,
        stack: error.stack,
      };
    } else if (error instanceof Error) {
      telemetryPayload.error = {
        errorId: error.errorId,
        name: error.name ?? 'Unknown error',
        message: error.message,
        stack: error.stack,
      };
    }

    await this.sendErrorTelemetry(telemetryPayload);
  }

  /**
   * Send the telemetry payload to the server.
   * @param payload - the telemetry payload to send
   * @returns
   */
  async sendMetric(payload: TelemetryMetricPayloadBody) {
    if (!this.shouldSendTelemetry()) {
      logger.debug('Telemetry is disabled, skipping metric telemetry', payload);
      return;
    }
    try {
      logger.debug('SDK Metric', payload);
      await TelemetryService.sendMetric(payload);
    } catch (error) {
      logger.error('Error sending metric telemetry', error);
    }
  }
  // @TODO: check if this will send the error telemetry to the server
  async sendErrorTelemetry(payload: TelemetryPayload) {
    if (!this.shouldSendTelemetry()) {
      logger.debug('Telemetry is disabled, skipping metric telemetry', payload);
      return;
    }
    try {
      logger.debug('SDK Error Telemetry', payload);
      await TelemetryService.sendErrorLog(payload);
    } catch (error) {
      logger.error('Error sending error telemetry', error);
    }
  }

  /**
   * Flush any pending telemetry and wait for it to complete.
   * This is automatically called on process exit in Node.js environments.
   */
  async flush(): Promise<void> {
    await this.batchProcessor.flush();
  }

  /**
   * Register process exit handlers to automatically flush telemetry.
   * Only registers handlers in Node.js environments (not in browsers).
   */
  private registerExitHandlers(): void {
    // Only register once and only in Node.js environments
    if (this.exitHandlersRegistered || typeof process === 'undefined' || !process.on) {
      return;
    }

    this.exitHandlersRegistered = true;

    const flushSync = () => {
      // Use a flag to track if we're already flushing to prevent double-flush
      this.flush().catch(error => {
        logger.debug('Error flushing telemetry on exit', error);
      });
    };

    // beforeExit is emitted when Node.js empties its event loop and has nothing else to schedule
    // This is the best place to flush async operations
    process.on('beforeExit', () => {
      flushSync();
    });

    // Handle SIGINT (Ctrl+C) and SIGTERM (kill command)
    const signalHandler = (signal: string) => {
      logger.debug(`Received ${signal}, flushing telemetry...`);
      this.flush()
        .catch(error => {
          logger.debug('Error flushing telemetry on signal', error);
        })
        .finally(() => {
          // Re-emit the signal to allow normal process termination
          process.removeListener(signal as NodeJS.Signals, () => signalHandler(signal));
          process.kill(process.pid, signal);
        });
    };

    process.on('SIGINT', () => signalHandler('SIGINT'));
    process.on('SIGTERM', () => signalHandler('SIGTERM'));
  }
}

export const telemetry = new TelemetryTransport();
