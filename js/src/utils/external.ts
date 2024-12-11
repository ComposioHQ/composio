import { spawn, spawnSync } from "child_process";
import { IS_DEVELOPMENT_OR_CI, TELEMETRY_URL } from "../sdk/utils/constants";
import { serializeValue } from "../sdk/utils/common";
import logger from "./logger";

type AcceptableJSONValue =
  | Record<string, unknown>
  | Array<Record<string, unknown>>
  | string
  | number
  | boolean
  | null
  | undefined;
/**
 * Sends a reporting payload to the telemetry server using a child process.
 * This function is intended for use in Node.js environments.
 *
 * @param {any} reportingPayload - The payload to be sent to the telemetry server.
 */
export function sendProcessReq(info: {
  url: string;
  method: string;
  headers: Record<string, string>;
  data: AcceptableJSONValue;
}) {
  if (IS_DEVELOPMENT_OR_CI) {
    console.log(
      `Hitting ${info.url}[${info.method}] with ${serializeValue(info.data)}`
    );
    return true;
  }

  try {
    // Use node-fetch for making HTTP requests
    const url = new URL(info.url);
    const child = spawn("node", [
      "-e",
      `
        const http = require('${url.protocol === "https:" ? "https" : "http"}');
        const options = {
          hostname: '${url.hostname}',
          path: '${url.pathname}${url.search}',
          port: ${url.port || (url.protocol === "https:" ? 443 : 80)},
          method: '${info.method}',
          headers: ${JSON.stringify(info.headers)}
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              console.log('Request successful');
            } else {
              console.error('Request failed with status:', res.statusCode);
            }
          });
        });

        req.on('error', (error) => {
          console.error('Error:', error.message);
          process.exit(1);
        });

        req.write(JSON.stringify(${JSON.stringify(info.data)}));
        req.end();
      `,
    ]);

    // // Close the stdin stream
    child.stdin.end();
  } catch (error) {
    logger.error("Error sending error to telemetry", error);
    // DO NOTHING
  }
}

/**
 * Sends a reporting payload to the telemetry server using XMLHttpRequest.
 * This function is intended for use in browser environments.
 *
 * @param {any} reportingPayload - The payload to be sent to the telemetry server.
 */
export function sendBrowserReq(info: {
  url: string;
  method: string;
  headers: Record<string, string>;
  data: AcceptableJSONValue;
}) {
  if (IS_DEVELOPMENT_OR_CI) {
    logger.debug(
      `Hitting ${info.url}[${info.method}] with ${serializeValue(info.data)}`
    );
    return true;
  }
  try {
    // Create a new XMLHttpRequest object
    const xhr = new XMLHttpRequest();
    // Open a new POST request to the telemetry server
    xhr.open(info.method, info.url, true);
    // Set the request header to indicate JSON content
    xhr.setRequestHeader("Content-Type", "application/json");
    Object.entries(info.headers || {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    // Define the onload event handler
    xhr.onload = function () {
      // Log the response if the request was successful
      if (xhr.status === 200) {
        logger.debug(xhr.response);
      }
    };

    // Send the reporting payload as a JSON string
    xhr.send(JSON.stringify(info.data));
  } catch (error) {
    logger.error("Error sending error to telemetry", error);
    // DO NOTHING
  }
}
