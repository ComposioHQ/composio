import { v4 as uuidv4 } from "uuid";
import Docker from "dockerode";
import os from "os";
import path from "path";
import { promises as fs } from "fs";

const COMPOSIO_PATH = path.resolve(__dirname, "../../../../../../");
const COMPOSIO_CACHE = path.join(os.homedir(), ".composio");
const ENV_COMPOSIO_DEV_MODE = "COMPOSIO_DEV_MODE";
const ENV_COMPOSIO_SWE_AGENT = "COMPOSIO_SWE_AGENT";
const DEFAULT_IMAGE = "angrybayblade/composio";
const DEFAULT_PORT = 54321;

function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = require("net").createServer();
        server.unref();
        server.on("error", reject);
        server.listen(0, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

export class DockerWorkspace {
    private docker: Docker;
    private container: Docker.Container | null = null;
    private id: string;
    private port: number = DEFAULT_PORT;
    private image: string;
    private url: string = "";

    constructor() {
        this.docker = new Docker();
        this.id = uuidv4();
        this.image = process.env[ENV_COMPOSIO_SWE_AGENT] || DEFAULT_IMAGE;
    }

    async setup() {
        this.port = await getFreePort();
        this.url = `http://localhost:${this.port}/api`;

        const containerOptions: Docker.ContainerCreateOptions = {
            Image: this.image,
            name: this.id,
            Cmd: ["/root/entrypoint.sh"],
            Tty: true,
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            OpenStdin: true,
            StdinOnce: false,
            ExposedPorts: {
                "8000/tcp": {},
            },
            HostConfig: {
                PortBindings: {
                    "8000/tcp": [
                        {
                            HostPort: this.port.toString(),
                        },
                    ],
                },
                Binds: [
                    `${COMPOSIO_PATH}:/opt/composio-core:rw`,
                    `${COMPOSIO_CACHE}:/root/.composio:rw`,
                ],
            },
            Env: [
                `${ENV_COMPOSIO_DEV_MODE}=${process.env[ENV_COMPOSIO_DEV_MODE] || "0"}`,
            ],
        };

        this.container = await this.docker.createContainer(containerOptions);
        await this.container.start();
        await this.waitForContainer();
    }

    private async waitForContainer() {
        while (true) {
            try {
                const response = await fetch(this.url);
                if (response.ok) {
                    return;
                }
            } catch (error) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }
    }

    async execute(command: string): Promise<string> {
        if (!this.container) {
            throw new Error("Container not initialized");
        }

        const exec = await this.container.exec({
            Cmd: ["/bin/bash", "-c", command],
            AttachStdout: true,
            AttachStderr: true,
        });

        const stream = await exec.start({ Detach: false });
        return new Promise((resolve, reject) => {
            let output = "";
            stream.on("data", (data: Buffer) => {
                output += data.toString();
            });
            stream.on("end", () => resolve(output));
            stream.on("error", reject);
        });
    }

    async teardown() {
        if (this.container) {
            await this.container.stop();
            await this.container.remove();
        }
    }
}
