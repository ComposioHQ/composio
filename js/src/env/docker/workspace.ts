import { v4 as uuidv4 } from "uuid";
import { RemoteWorkspace, WorkspaceConfig } from "../base";
import { getEnvVariable, nodeExternalRequire } from "../../utils/shared";
import type Docker from "dockerode";
import type CliProgress from "cli-progress";

const ENV_COMPOSIO_DEV_MODE = "COMPOSIO_DEV_MODE";
const ENV_COMPOSIO_SWE_AGENT = "COMPOSIO_SWE_AGENT";
const DEFAULT_IMAGE = "composio/composio";
const DEFAULT_PORT = 54321;

function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = require("node:net").createServer();
        server.unref();
        server.on("error", reject);
        server.listen(0, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

export class DockerWorkspace extends RemoteWorkspace {
    public docker: Docker;
    public container: any | null = null;
    public id: string;
    public port: number = DEFAULT_PORT;
    public image: string;
    public url: string = "";

    constructor(kwargs: WorkspaceConfig) {
        super(kwargs);
        this.id = `composio-${uuidv4()}`;
        this.image = getEnvVariable(ENV_COMPOSIO_SWE_AGENT, DEFAULT_IMAGE)!;
        this.docker = nodeExternalRequire("dockerode")();
    }

    async setup() {
        this.port = await getFreePort();
        this.url = `http://localhost:${this.port}/api`;

        const images = await this.docker.listImages();
        const imageExists = images.some((image: any) => image.RepoTags && image.RepoTags.find((tag: any) => tag.startsWith(this.image)));


        if (!imageExists) {
            console.log(`Pulling Docker image ${this.image}...`);
            let cliProgress = nodeExternalRequire("cli-progress");

            const bar: CliProgress.Bar = new cliProgress.SingleBar({
                format: '{bar} | {percentage}% | {status}',
                hideCursor: true
            }, cliProgress.Presets.shades_classic);
    
            bar.start(100, 0, { status: 'Initializing...' });
            bar.update({ status: `Image ${this.image} not found locally. Pulling from Docker Hub...` });
            await new Promise((resolve, reject) => {
                this.docker.pull(this.image, (err: any, stream: any) => {
                    if (err) {
                        bar.stop();
                        console.error('Failed to pull Docker image.');
                        return reject(err);
                    }
                    this.docker.modem.followProgress(stream, onFinished, onProgress);

                    function onFinished(err: any, output: any) {
                        if (err) {
                            bar.stop();
                            console.error('Failed to pull Docker image.');
                            return reject(err);
                        }
                        bar.update(100, { status: 'Docker image pulled successfully.' });
                        bar.stop();
                        resolve(output);
                    }

                    function onProgress(event: any) {
                        bar.update({ status: event.status });
                    }
                });
            });
        } else {
            console.debug(`Image ${this.image} found locally.`);
        }

        const containers = await this.docker.listContainers({ all: true });
        const existingContainer = containers.find((container: any) => container.Names.find((name: any) => name.startsWith(`/composio-`)));

        if (existingContainer) {
            console.debug(`Container with name ${this.id} is already running.`);
            this.container = this.docker.getContainer(existingContainer.Id);
            this.port = existingContainer.Ports.find((port: any) => port.PrivatePort === 8000)?.PublicPort!;
            this.url = `http://localhost:${this.port}/api`;
        } else {

            const path = require("node:path");
            const os = require("node:os");

            const COMPOSIO_PATH = path.resolve(__dirname, "../../../../python/");
            const COMPOSIO_CACHE = path.join(os.homedir(), ".composio");

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
                    ...Object.entries(this.environment).map(([key, value]) => `${key}=${value}`),
                    `${ENV_COMPOSIO_DEV_MODE}=${getEnvVariable(ENV_COMPOSIO_DEV_MODE, "0")}`,
                ],
            };

            this.container = await this.docker.createContainer(containerOptions);
            await this.container.start();
        }
        await this.waitForContainer();
    }

    private async waitForContainer() {
        while (true) {
            try {
                const response = await fetch(this.url, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": this.environment.composioAPIKey,
                    },
                });
                if (response.ok) {
                    return;
                }
            } catch (error) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }
    }

    async teardown() {
        if (this.container) {
            console.log(`Stopping container ${this.container.id}...`);
            try {
                await this.container.kill();
                await this.container.remove();
            } catch (error) {
                console.debug("Failed to stop and remove container:", error);
            }
        }
    }
}
