import logger from '../../utils/logger';
import { TelemetryMetricPayloadBody, TelemetryPayload } from './TelemetryService.types';

const TELEMETRY_URL = 'https://telemetry.composio.dev/v1';
const TELEMETRY_TIMEOUT_MS = 3_000;

export class TelemetryService {
  /**
   * POSTs a best-effort telemetry payload, bounding the request so a stalled
   * endpoint cannot leave it pending indefinitely.
   *
   * A hand-rolled timer rather than AbortSignal.timeout so it can be cleared the
   * moment the response lands: an uncleared timer is itself pending work, which on
   * workerd pins the request context open for the full timeout on every successful
   * send. Mirrors the bound applied to the npm version check.
   */
  private static postWithTimeout(url: string, payload: unknown) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TELEMETRY_TIMEOUT_MS);
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  }

  /**
   * Sends a metric to the Telemetry API.
   * @param payload - The payload to send to the Telemetry API.
   * @returns The response from the Telemetry API.
   */
  static async sendMetric(payload: TelemetryMetricPayloadBody) {
    try {
      const result = await this.postWithTimeout(`${TELEMETRY_URL}/metrics/invocations`, payload);
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
      const result = await this.postWithTimeout(`${TELEMETRY_URL}/errors`, payload);
      return result;
    } catch (error) {
      // ignore error for now; telemetry failures should never affect SDK calls
      logger.debug('Error sending error telemetry', error);
    }
  }
}
