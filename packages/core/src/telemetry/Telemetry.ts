import { InstrumentedInstance, TELEMETRY_EVENTS, TelemetryMetadata, TelemetryPayload } from "../types/telemetry.types";
import { TELEMETRY_URL } from "../utils/constants";
import { getEnvVariable } from "../utils/env";
import { BatchProcessor } from "./BatchProcessor";
import { BaseTelemetryTransport } from "./TelemetryTransport";
import { BrowserTelemetryTransport } from "./transports/BrowserTransport";
import { ProcessTelemetryTransport } from "./transports/ProcessTransport";
/**
 * The Telemetry class is used to log the telemetry for any given instance which extends InstrumentedInstance.
 * 
 * This class is used to instrument the telemetry for the given instance and send the telemetry to the server.  
 * This class is also used to create a global error handler for the given instance.
 * 
 * @example
 * 
 * const telemetry = new Telemetry({...});
 * const composio = new Composio({...})
 * 
 * telemetry.instrumentTelemetry(composio);
 * telemetry.instrumentTelemetry(composio.tools);
 * telemetry.instrumentTelemetry(composio.toolkits);
 * telemetry.instrumentTelemetry(composio.triggers);
 * 
 */
export class Telemetry<U extends InstrumentedInstance> {

    private telemetryMetadata: TelemetryMetadata;
    private transport: BaseTelemetryTransport;

    private batchProcessor = new BatchProcessor(100, 10, async (data) => {
        await this.sendTelemetry(data as TelemetryPayload[]);
    });

    constructor(metadata: TelemetryMetadata, transport?: BaseTelemetryTransport) {
        this.telemetryMetadata = metadata;

        const isBrowser = typeof window !== "undefined";
        if (transport) {
            this.transport = transport;
        } else if (isBrowser) {
            this.transport = new BrowserTelemetryTransport();
        } else {
            this.transport = new ProcessTelemetryTransport();
        }

        // send telemetry event for SDK initialization
        this.sendTelemetry([{
            eventName: TELEMETRY_EVENTS.SDK_INITIALIZED,
            data: {},
            sdk_meta: this.telemetryMetadata,
        }]);
    }

    /**
     * Instrument the telemetry for the given instance.
     * 
     * You can pass the instance and the file name of the instance to instrument the telemetry.
     * This will instrument all the methods of the instance and log the telemetry for each method call.
     * @param instance - any instance that extends InstrumentedInstance
     * @param fileName - the file name of the instance
     * @returns 
     */
    instrumentTelemetry(instance: U, fileName?: string) {
        const proto = Object.getPrototypeOf(instance);
        const methodNames = Object.getOwnPropertyNames(proto).filter((key) => {
            const descriptor = Object.getOwnPropertyDescriptor(proto, key);
            return (
                key !== "constructor" &&
                descriptor &&
                typeof descriptor.value === "function" &&
                descriptor.value.constructor.name === "AsyncFunction"
            );
        });

        for (const name of methodNames) {
            const originalMethod = (instance as any)[name];
            (instance as any)[name] = async (...args: any[]) => {
                const telemetryPayload: TelemetryPayload = {
                    eventName: TELEMETRY_EVENTS.SDK_METHOD_INVOKED,
                    data: {
                        fileName: instance.FILE_NAME ?? fileName ?? "unknown",
                        method: name,
                        params: args,
                    },
                    sdk_meta: this.telemetryMetadata,
                }

                this.batchProcessor.pushItem(telemetryPayload);


                // @TODO: Add a try catch here to create global error handler
                try {

                    return await originalMethod.apply(instance, args);
                } catch (error) {
                    const telemetryPayload: TelemetryPayload = {
                        eventName: TELEMETRY_EVENTS.SDK_METHOD_ERROR,
                        data: {
                            fileName: instance.FILE_NAME ?? fileName ?? "unknown",
                            method: name,
                            params: args,
                            error: error,
                        },
                        sdk_meta: this.telemetryMetadata,
                    }
                    this.batchProcessor.pushItem(telemetryPayload);
                    throw error;
                }
            };
        }

        return instance;
    }

    /**
     * Send the telemetry payload to the server.
     * @param payload - the telemetry payload to send
     * @returns 
     */
    async sendTelemetry(payload: TelemetryPayload[]) {
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


        this.transport.send(reqPayload);
    }

}
