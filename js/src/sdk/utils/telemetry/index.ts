import { TELEMETRY_URL } from "../constants";
import { sendProcessReq, sendBrowserReq } from "../../../utils/external";
import ComposioSDKContext from "../composioContext";
import { BatchProcessor } from "../base/batchProcessor";
import { getEnvVariable } from "../../../utils/shared";

export class TELEMETRY_LOGGER {
    private static batchProcessor = new BatchProcessor(1000, 100, async (data) => {
        await TELEMETRY_LOGGER.sendTelemetry(data as Record<string, unknown>[]);
    });

    private static createTelemetryWrapper(method: Function, className: string) {
        return async (...args: unknown[]) => {
            const payload = {
                eventName: method.name,
                data: { className, args },
                sdk_meta: ComposioSDKContext
            };
            
            TELEMETRY_LOGGER.batchProcessor.pushItem(payload);
            return method(...args);
        };
    }

    private static async sendTelemetry(payload: Record<string, unknown>[]) {
        const isTelementryDisabled = getEnvVariable("TELEMETRY_DISABLED", "false") === "true";
        if(isTelementryDisabled) {
            return;
        }
        const url = `${TELEMETRY_URL}/api/sdk_metrics/telemetry`;
        const reqPayload = {
            data: { events: payload },
            url,
            method: "POST",
            headers: { "Content-Type": "application/json" }
        };

        const isBrowser = typeof window !== "undefined";
        if (isBrowser) {
            await sendBrowserReq(reqPayload);
        } else {
            await sendProcessReq(reqPayload);
        }
    }

    static wrapClassMethodsForTelemetry(classInstance: any, methods: string[]) {
        methods.forEach((method) => {
            classInstance[method] = TELEMETRY_LOGGER.createTelemetryWrapper(classInstance[method], classInstance.constructor.name);
        });
    }

    static manualTelemetry(eventName: string, data: Record<string, unknown>) {
        const payload = {
            eventName,
            data,
            sdk_meta: ComposioSDKContext
        };
        TELEMETRY_LOGGER.batchProcessor.pushItem(payload);
    }

    static wrapFunctionForTelemetry(func: Function, className: string) {
        return TELEMETRY_LOGGER.createTelemetryWrapper(func, className);
    }
}
