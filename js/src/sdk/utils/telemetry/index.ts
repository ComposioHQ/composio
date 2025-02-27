import { sendBrowserReq, sendProcessReq } from "../../../utils/external";
import { getEnvVariable } from "../../../utils/shared";
import { BatchProcessor } from "../base/batchProcessor";
import ComposioSDKContext from "../composioContext";
import { TELEMETRY_URL } from "../constants";

export class TELEMETRY_LOGGER {
  private static batchProcessor = new BatchProcessor(100, 10, async (data) => {
    await TELEMETRY_LOGGER.sendTelemetry(data as Record<string, unknown>[]);
  });

  private static createTelemetryWrapper(method: Function, className: string) {
    return async (...args: unknown[]) => {
      const payload = {
        eventName: method.name,
        data: { className, args },
        sdk_meta: {
          apiKey: ComposioSDKContext.apiKey,
          baseURL: ComposioSDKContext.baseURL,
          composioVersion: ComposioSDKContext.composioVersion,
          frameworkRuntime: ComposioSDKContext.frameworkRuntime,
          source: ComposioSDKContext.source,
          sessionId: ComposioSDKContext.sessionId,
          isBrowser: typeof window !== "undefined",
        },
      };

      TELEMETRY_LOGGER.batchProcessor.pushItem(payload);
      return method(...args);
    };
  }

  private static async sendTelemetry(payload: Record<string, unknown>[]) {
    const isTelemetryDisabled =
      getEnvVariable("TELEMETRY_DISABLED", "false") === "true";

    if (isTelemetryDisabled) {
      return;
    }

    const url = `${TELEMETRY_URL}/api/sdk_metrics/telemetry`;

    const reqPayload = {
      data: payload,
      url,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };

    const isBrowser = typeof window !== "undefined";
    if (isBrowser) {
      await sendBrowserReq(reqPayload);
    } else {
      await sendProcessReq(reqPayload);
    }
  }

  static manualTelemetry(eventName: string, data: Record<string, unknown>) {
    const payload = {
      eventName,
      data,
      sdk_meta: {
        apiKey: ComposioSDKContext.apiKey,
        baseURL: ComposioSDKContext.baseURL,
        composioVersion: ComposioSDKContext.composioVersion,
        frameworkRuntime: ComposioSDKContext.frameworkRuntime,
        source: ComposioSDKContext.source,
        isBrowser: typeof window !== "undefined",
      },
    };
    TELEMETRY_LOGGER.batchProcessor.pushItem(payload);
  }

  static wrapFunctionForTelemetry(func: Function, className: string) {
    return TELEMETRY_LOGGER.createTelemetryWrapper(func, className);
  }
}
