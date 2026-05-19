import logger from '../../utils/logger';
import { TelemetryMetricPayloadBody, TelemetryPayload } from './TelemetryService.types';

const TELEMETRY_URL = 'https://telemetry.composio.dev/v1';

export class TelemetryService {
  /**
   * Sends a metric to the Telemetry API.
   * @param payload - The payload to send to the Telemetry API.
   * @returns The response from the Telemetry API.
   */
  static async sendMetric(payload: TelemetryMetricPayloadBody) {
    try {
      const result = await fetch(`${TELEMETRY_URL}/metrics/invocations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      return result;
    } catch (error) {
      // ignore error for now; telemetry failures should never affect SDK calls
      logger.debug('Error sending metric telemetry', error);
    }
  }

  /**
   * Sends an error log to the Telemetry API.
   * @param payload - The payload to send to the Telemetry API.
   * @returns The response from the Telemetry API.
   */
  static async sendErrorLog(payload: TelemetryPayload) {
    try {
      const result = await fetch(`${TELEMETRY_URL}/errors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      return result;
    } catch (error) {
      // ignore error for now; telemetry failures should never affect SDK calls
      logger.debug('Error sending error telemetry', error);
    }
  }
}
