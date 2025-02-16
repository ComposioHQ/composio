import { sendBrowserReq, sendProcessReq } from "../../../utils/external";
import logger from "../../../utils/logger";
import { getEnvVariable } from "../../../utils/shared";
import ComposioSDKContext from "../composioContext";
import { TELEMETRY_URL } from "../constants";

type ErrorPayload = {
  error_id: string;
  error_code: string;
  original_error: string;
  description: string;
  metadata: Record<string, unknown>;
  message: string;
  possible_fix: string;
  current_stack: string[];
};

export async function logError(payload: ErrorPayload) {
  const isTelemetryDisabled =
    getEnvVariable("TELEMETRY_DISABLED", "false") === "true";
  if (isTelemetryDisabled) {
    return;
  }
  try {
    const isBrowser = typeof window !== "undefined";
    const reportingPayload = generateReportingPayload(payload);
    const reqPayload = {
      data: reportingPayload,
      url: `${TELEMETRY_URL}/api/sdk_metrics/error`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (isBrowser) {
      await sendBrowserReq(reqPayload);
    } else {
      await sendProcessReq(reqPayload);
    }
  } catch (error) {
    logger.debug("Error sending error to telemetry", error);
    // DO NOTHING
  }
}

function generateReportingPayload(payload: ErrorPayload) {
  const { apiKey, baseURL, composioVersion, frameworkRuntime, source } =
    ComposioSDKContext;
  const {
    error_id,
    error_code,
    description,
    message,
    possible_fix,
    original_error,
    current_stack,
  } = payload;

  return {
    error_id,
    error_code,
    description,
    error_message: message,
    possible_fix,
    original_error,
    current_stack,
    sdk_meta: {
      platform: process.platform,
      version: composioVersion,
      baseURL,
      apiKey,
      frameworkRuntime,
      source,
    },
  };
}
