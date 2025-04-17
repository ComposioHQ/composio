
export const TELEMETRY_EVENTS = {
    SDK_INITIALIZED: "SDK_INITIALIZED",
    SDK_METHOD_INVOKED: "SDK_METHOD_INVOKED",
    SDK_METHOD_ERROR: "SDK_METHOD_ERROR",
    CLI_INVOKED: "CLI_INVOKED",
} as const;

export type TelemetryEvent = typeof TELEMETRY_EVENTS[keyof typeof TELEMETRY_EVENTS];


/**
 * Interface for any instance that extends InstrumentedInstance.
 * Classess implementing this interface will be instrumented for telemetry.
 */
export interface InstrumentedInstance {
    FILE_NAME: string;
}

/**
 * Metadata for the telemetry.
 */
export type TelemetryMetadata = {
    apiKey: string;
    baseUrl: string;
    composioVersion: string;
    frameworkRuntime: string;
    source: string;
    sessionId: string;
    isBrowser?: boolean;
}

export type TelemetryPayload = {
    eventName: TelemetryEvent;
    data: Record<string, unknown>;
    sdk_meta: TelemetryMetadata;
}


type AcceptableJSONValue =
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | string
    | number
    | boolean
    | null
    | undefined;

export interface TelemetryTransportParams {
    url: string;
    method: string;
    headers: Record<string, string>;
    data: AcceptableJSONValue;
}
