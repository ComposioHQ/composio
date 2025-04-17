import { TelemetryTransportParams } from "../../types/telemetry.types";
import { BaseTelemetryTransport } from "../TelemetryTransport";

export class ProcessTelemetryTransport implements BaseTelemetryTransport {
    send(payload: TelemetryTransportParams): Promise<void> {
        if (typeof window !== 'undefined') {
            return Promise.reject(new Error('ProcessTelemetryTransport can only be used in Node.js environments'));
        }

        return new Promise((resolve) => {
            try {
                const url = new URL(payload.url);
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
                        method: '${payload.method}',
                        headers: ${JSON.stringify(payload.headers)}
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

                    req.write(JSON.stringify(${JSON.stringify(payload.data)}));
                    req.end();
                    `,
                ];

                const { spawn } = require("child_process");
                spawn("node", args, {
                    stdio: "ignore",
                    detached: true,
                    shell: false,
                }).unref();
                resolve();
            } catch (error) {
                resolve();
            }
        });
    }
}