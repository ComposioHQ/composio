import { TelemetryTransportParams } from '../types/telemetry.types';
import logger from '../utils/logger';

export abstract class BaseTelemetryTransport {
  /**
   * Send the payload to the telemetry service.
   * @param payload - The payload to send.
   */
  abstract send(payload: TelemetryTransportParams): Promise<void>;
}

/**
 * A telemetry transport that logs to the console.
 * This is just for testing purposes.
 */
export class ConsoleTelemetryTransport implements BaseTelemetryTransport {
  send(payload: TelemetryTransportParams): Promise<void> {
    logger.info('payload', payload);
    return Promise.resolve();
  }
}
