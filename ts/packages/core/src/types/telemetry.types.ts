export const TELEMETRY_EVENTS = {
  SDK_INITIALIZED: 'SDK_INITIALIZED',
  SDK_METHOD_INVOKED: 'SDK_METHOD_INVOKED',
  SDK_METHOD_ERROR: 'SDK_METHOD_ERROR',
  CLI_INVOKED: 'CLI_INVOKED',
} as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[keyof typeof TELEMETRY_EVENTS];

/**
 * Metadata for the telemetry.
 */
export type TelemetryMetadata = {
  /**
   * The API key of the SDK.
   * @example 'sk-1234567890'
   */
  apiKey: string;
  /**
   * The base URL of the SDK.
   * @example 'https://api.composio.dev'
   */
  baseUrl: string;
  /**
   * The version of the SDK.
   * @example '1.0.0'
   */
  version: string;
  /**
   * The host service name of the SDK where the SDK is running.
   * @example 'mcp', 'apollo' etc
   */
  host?: string;
  /**
   * Whether the SDK is agentic.
   * @example true, false
   */
  isAgentic: boolean;
  /**
   * The provider of the SDK.
   * @example 'openai', 'anthropic', 'google', 'azure', 'composio'
   */
  provider?: string;
  isBrowser?: boolean;
};

export type TelemetryPayloadParams = {
  eventName: TelemetryEvent;
  data: Record<string, unknown>;
};
export type TelemetryPayload = TelemetryPayloadParams & {
  sdk_meta: TelemetryMetadata;
};

export type TelemetryErrorPayloadParams = {
  error_id: string;
  error_message: string;
  original_error: unknown;
  error_code?: string | undefined;
  possible_fix?: string | undefined;
  description?: string;
  current_stack?: string[];
};
export type TelemetryErrorPayload = TelemetryErrorPayloadParams & {
  sdk_meta: TelemetryMetadata;
};

type AcceptableJSONValue =
  | Record<string, unknown>
  | Array<Record<string, unknown>>
  | string
  | number
  | boolean
  | null
  | undefined;

export const TELEMETRY_TYPES = {
  SDK_USAGE: 'SDK_USAGE',
  SDK_ERROR: 'SDK_ERROR',
} as const;

export type TelemetryType = (typeof TELEMETRY_TYPES)[keyof typeof TELEMETRY_TYPES];

export interface TelemetryTransportParams {
  url: string;
  method: string;
  headers: Record<string, string>;
  data: AcceptableJSONValue;
}
