import { TelemetryMetricPayloadBody, TelemetryPayload } from './TelemetryService.types';

const TELEMETRY_URL = 'https://telemetry.composio.dev/v1';

export class TelemetryService {
  /**
   * Sends a metric to the Telemetry API.
   * @param payload - The payload to send to the Telemetry API.
   * @returns The response from the Telemetry API.
   */
  static async sendMetric(payload: TelemetryMetricPayloadBody) {
    return fetch(`${TELEMETRY_URL}/metrics/invocations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Sends an error log to the Telemetry API.
   * @param payload - The payload to send to the Telemetry API.
   * @returns The response from the Telemetry API.
   */
  static async sendErrorLog(payload: TelemetryPayload) {
    return fetch(`${TELEMETRY_URL}/errors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }
}
