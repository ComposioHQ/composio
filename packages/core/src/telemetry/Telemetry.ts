import {
  TELEMETRY_EVENTS,
  TELEMETRY_TYPES,
  TelemetryMetadata,
  TelemetryPayload,
} from '../types/telemetry.types';
import { TELEMETRY_URL } from '../utils/constants';
import { getEnvVariable } from '../utils/env';
import { BatchProcessor } from './BatchProcessor';
import { BaseTelemetryTransport } from './TelemetryTransport';
import { BrowserTelemetryTransport } from './transports/BrowserTransport';
import { ProcessTelemetryTransport } from './transports/ProcessTransport';
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
        sdk_meta: this.telemetryMetadata,
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
        const telemetryPayload: TelemetryPayload = {
          eventName: TELEMETRY_EVENTS.SDK_METHOD_INVOKED,
          data: {
            fileName: instrumentedClassName,
            method: name,
            params: args,
          },
          sdk_meta: this.telemetryMetadata,
        };

        this.batchProcessor.pushItem(telemetryPayload);

        try {
          return await originalMethod.apply(instance, args);
        } catch (error) {
          const telemetryPayload: TelemetryPayload = {
            eventName: TELEMETRY_EVENTS.SDK_METHOD_ERROR,
            data: {
              fileName: instrumentedClassName,
              method: name,
              params: args,
              error: error,
            },
            sdk_meta: this.telemetryMetadata,
          };
          this.batchProcessor.pushItem(telemetryPayload);
          throw error;
        }
      };
    }

    return instance;
  }

  /**
   * Send the telemetry payload to the server.
   * @param payload - the telemetry payload to send
   * @returns
   */
  async sendTelemetry(payload: TelemetryPayload[]) {
    const isTelemetryDisabled =
      this.isTelemetryDisabled || getEnvVariable('TELEMETRY_DISABLED', 'false') === 'true';

    if (!this.transport || isTelemetryDisabled) {
      return;
    }

    const url = `${TELEMETRY_URL}/api/sdk_metrics/telemetry`;

    const reqPayload = {
      data: payload,
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };

    this.transport.send(reqPayload);
  }
}

export const telemetry = new TelemetryService();
