import { serializeValue } from "../sdk/utils/common";
import { IS_DEVELOPMENT_OR_CI } from "../sdk/utils/constants";
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
    logger.debug(
      `Hitting ${info.url}[${info.method}] with ${serializeValue(info.data)}`
    );
    return true;
  }

  try {
    const url = new URL(info.url);
    const protocol = url.protocol === "https:" ? "https" : "http";
    const port = url.port || (url.protocol === "https:" ? 443 : 80);

    const args = [
      "-e",
      `
      const http = require('${protocol}');
      const options = {
        hostname: '${url.hostname}',
        path: '${url.pathname}${url.search}',
        port: ${port},
        method: '${info.method}',
        headers: ${JSON.stringify(info.headers)}
      };

      const req = http.request(options, (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          process.exit(0);
        });
      });

      req.on('error', () => {
        process.exit(0);
      });

      req.write(JSON.stringify(${JSON.stringify(info.data)}));
      req.end();
      `,
    ];

    // Use spawn with detached option instead of spawnSync to make it non-blocking
    const { spawn } = require("child_process");
    spawn("node", args, {
      stdio: "ignore",
      detached: true,
      shell: false,
    }).unref();
    return true;
  } catch (error) {
    logger.debug("Error sending error to telemetry", error);
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
    logger.debug("Error sending error to telemetry", error);
    // DO NOTHING
  }
}
