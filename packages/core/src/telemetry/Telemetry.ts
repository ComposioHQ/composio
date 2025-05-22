// Extend the Error interface to include errorId
declare global {
  interface Error {
    errorId?: string;
  }
}

import { ComposioError as ComposioClientError } from '@composio/client';
import {
  TELEMETRY_EVENTS,
  // TelemetryErrorPayload,
  TelemetryErrorPayloadParams,
  TelemetryMetadata,
  TelemetryPayload,
  TelemetryPayloadParams,
} from '../types/telemetry.types';
import { TELEMETRY_URL } from '../utils/constants';
import { getEnvVariable } from '../utils/env';
import { BatchProcessor } from './BatchProcessor';
import { BaseTelemetryTransport } from './TelemetryTransport';
import { BrowserTelemetryTransport } from './transports/BrowserTransport';
import { ProcessTelemetryTransport } from './transports/ProcessTransport';
import { ComposioError } from '../errors/ComposioError';
import { getRandomUUID } from '../utils/uuid';
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
export class TelemetryService {
  private telemetryMetadata!: TelemetryMetadata;
  private transport!: BaseTelemetryTransport;
  private isTelemetryDisabled: boolean = true;

  private batchProcessor = new BatchProcessor(100, 10, async data => {
    await this.sendTelemetry(data as TelemetryPayload[]);
  });

  setup(metadata: TelemetryMetadata, transport?: BaseTelemetryTransport) {
    this.telemetryMetadata = metadata;
    this.isTelemetryDisabled = false;

    const isBrowser = typeof window !== 'undefined';
    if (transport) {
      this.transport = transport;
    } else if (isBrowser) {
      this.transport = new BrowserTelemetryTransport();
      this.telemetryMetadata.transport = 'browser';
    } else {
      this.transport = new ProcessTelemetryTransport();
      this.telemetryMetadata.transport = 'process';
    }

    // send telemetry event for SDK initialization
    this.sendTelemetry([
      {
        eventName: TELEMETRY_EVENTS.SDK_INITIALIZED,
        data: {},
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
    // use the constructor name if available, otherwise use the file name
    const instrumentedClassName = instance.constructor?.name || fileName || 'unknown';

    for (const name of methodNames) {
      const originalMethod = (instance as unknown as Record<string, Function>)[name] as (
        ...args: unknown[]
      ) => Promise<unknown>;

      (instance as unknown as Record<string, Function>)[name] = async (...args: unknown[]) => {
        const telemetryPayload: TelemetryPayloadParams = {
          eventName: TELEMETRY_EVENTS.SDK_METHOD_INVOKED,
          data: {
            fileName: instrumentedClassName,
            method: name,
            params: args,
          },
        };

        this.batchProcessor.pushItem(telemetryPayload);

        try {
          return await originalMethod.apply(instance, args);
        } catch (error) {
          // inject error id to the error, this is to ensure we can track the error in logs
          if (error instanceof Error && !error.errorId) {
            // if there is error id, it means the error is already handled
            error.errorId = getRandomUUID();
            await this.prepareAndSendErrorTelemetry(error, instrumentedClassName, name, args);
          }
          // @TODO: check if this will send the error telemetry to the server
          // rethrow the error to be handled by the caller
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
    const devEnvironments = ['test', 'development', 'CI'];
    const nodeEnv = (getEnvVariable('NODE_ENV', 'development') || '').toLowerCase();
    const isDevEnvironment = devEnvironments.includes(nodeEnv);
    const isTelemetryDisabledByEnv = getEnvVariable('TELEMETRY_DISABLED', 'false') === 'true';

    return (
      this.transport && !this.isTelemetryDisabled && !isTelemetryDisabledByEnv && !isDevEnvironment
    );
  }

  /**
   * Prepare and send the error telemetry.
   * @param {unknown} error - The error to send.
   * @param {string} instrumentedClassName - The class name of the instrumented class.
   * @param {string} name - The name of the method that threw the error.
   */
  private async prepareAndSendErrorTelemetry(
    error: unknown,
    instrumentedClassName: string,
    name: string,
    args: unknown[]
  ) {
    // client error, this is likely handled by the API itseld
    if (error instanceof ComposioClientError) {
      const telemetryPayload: TelemetryErrorPayloadParams = {
        error_id: error.errorId || '',
        error_message: error.message,
        original_error: error.cause || error,
        current_stack: error.stack?.split('\n') || [],
        description: `Original Call : ${this.telemetryMetadata?.source}:${instrumentedClassName}.${name}(${JSON.stringify(args)})`,
      };
      await this.sendErrorTelemetry(telemetryPayload);
    } else if (error instanceof ComposioError) {
      // Composio SDK Errors
      const telemetryPayload: TelemetryErrorPayloadParams = {
        error_id: error.errorId || '',
        error_message: error.message,
        original_error: error.cause || error,
        current_stack: error.stack?.split('\n') || [],
        error_code: error.code,
        possible_fix: error.possibleFixes?.join('\n'),
        description: `Original Call : ${instrumentedClassName}.${name}(${JSON.stringify(args)})`,
      };
      await this.sendErrorTelemetry(telemetryPayload);
    } else if (error instanceof Error) {
      // Unhandled errors
      const telemetryPayload: TelemetryErrorPayloadParams = {
        error_id: error.errorId || '',
        error_message: error instanceof Error ? error.name : 'Unknown error',
        original_error: error,
        current_stack: error.stack?.split('\n') || [],
        description: `Original Call : ${this.telemetryMetadata?.source}:${instrumentedClassName}.${name}(${JSON.stringify(args)})`,
      };
      await this.sendErrorTelemetry(telemetryPayload);
    }
  }

  /**
   * Send the telemetry payload to the server.
   * @param payload - the telemetry payload to send
   * @returns
   */
  async sendTelemetry(payload: TelemetryPayloadParams[]) {
    if (!this.shouldSendTelemetry()) {
      return;
    }

    const url = `${TELEMETRY_URL}/api/sdk_metrics/telemetry`;

    const reqPayload = {
      data: payload.map(p => ({
        ...p,
        sdk_meta: this.telemetryMetadata,
      })),
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };

    this.transport.send(reqPayload);
  }
  // @TODO: check if this will send the error telemetry to the server
  async sendErrorTelemetry(payload: TelemetryErrorPayloadParams) {
    if (!this.shouldSendTelemetry()) {
      return;
    }

    const url = `${TELEMETRY_URL}/api/sdk_metrics/error`;

    const reqPayload = {
      data: {
        ...payload,
        sdk_meta: this.telemetryMetadata,
      },
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };

    await this.transport.send(reqPayload);
  }
}

export const telemetry = new TelemetryService();
