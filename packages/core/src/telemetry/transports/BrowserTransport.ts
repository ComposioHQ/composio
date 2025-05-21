import { TelemetryTransportParams } from '../../types/telemetry.types';
import logger from '../../utils/logger';
import { BaseTelemetryTransport } from '../TelemetryTransport';
import { telemetry } from '../Telemetry';
export class BrowserTelemetryTransport implements BaseTelemetryTransport {
  constructor() {
    telemetry.instrument(this);
  }
  send(payload: TelemetryTransportParams): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.reject(
        new Error('BrowserTelemetryTransport can only be used in browser environments')
      );
    }

    return new Promise(resolve => {
      try {
        // Create a new XMLHttpRequest object
        const xhr = new XMLHttpRequest();
        // Open a new POST request to the telemetry server
        xhr.open(payload.method, payload.url, true);
        // Set the request header to indicate JSON content
        xhr.setRequestHeader('Content-Type', 'application/json');
        Object.entries(payload.headers || {}).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });

        // Define the onload event handler
        xhr.onload = function () {
          // Log the response if the request was successful
          // if (xhr.status === 200) {
          //     logger.debug(xhr.response);
          // }
          resolve();
        };

        // Send the reporting payload as a JSON string
        xhr.send(JSON.stringify(payload.data));
      } catch (error) {
        logger.error('Error sending error to telemetry', error);
        // logger.debug("Error sending error to telemetry", error);
        // DO NOTHING
        resolve();
      }
    });
  }
}
