import { RemoteWorkspace } from "../base";
import { getEnvVariable, nodeExternalRequire } from "../../utils/shared";
import type Docker from "dockerode";
import type CliProgress from "cli-progress";
import { IWorkspaceConfig, WorkspaceConfig } from "../config";
import logger from "../../utils/logger";
import { getUUID } from "../../utils/getUUID";
import { getComposioDir } from "../../sdk/utils/fileUtils";

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

export type IDockerConfig = IWorkspaceConfig & {
  /** Name of the docker image. */
  image?: string;

  /**
   * Ports to bind inside the container
   *
   * Note: port 8000 is reserved for the tooling server inside the container
   */
  ports?: { [key: number]: any };

  /** Volumes to bind inside the container */
  volumes?: { [key: string]: any };
};

export class DockerWorkspace extends RemoteWorkspace {
  public docker: Docker;
  public container: any | null = null;
  public id: string;
  public port: number = DEFAULT_PORT;
  public image: string;
  public url: string = "";

  private _ports?: IDockerConfig["ports"];
  private _volumes?: IDockerConfig["volumes"];

  constructor(configRepo: WorkspaceConfig<IDockerConfig>) {
    super(configRepo);
    this.id = `composio-${getUUID()}`;
    this.image = getEnvVariable(ENV_COMPOSIO_SWE_AGENT, DEFAULT_IMAGE)!;
    this.docker = nodeExternalRequire("dockerode")();
    this._ports = configRepo.config.ports;
    this._volumes = configRepo.config.volumes;
  }

  private getBaseDockerConfig() {
    const IS_DEV_MODE = getEnvVariable(ENV_COMPOSIO_DEV_MODE, "0");

    const exposedPorts: { [key: string]: {} } = {
      "8000/tcp": {},
    };
    const portBindings: { [key: string]: Array<{ HostPort: string }> } = {
      "8000/tcp": [
        {
          HostPort: this.port.toString(),
        },
      ],
    };

    // Add additional ports if specified in the environment configuration
    if (this._ports) {
      for (const port of Object.keys(this._ports)) {
        const portKey = `${port}/tcp`;
        exposedPorts[portKey] = {};
        portBindings[portKey] = [{ HostPort: port }];
      }
    }

    const volumeBindings: Array<string> = [];

    // Add additional volumes if specified in the environment configuration
    if (this._volumes) {
      for (const hostPath in this._volumes) {
        const containerPath = this._volumes[hostPath];
        volumeBindings.push(`${hostPath}:${containerPath}`);
      }
    }

    if (IS_DEV_MODE === "1") {
      const path = require("node:path");
      const os = require("node:os");

      const COMPOSIO_PATH = path.resolve(__dirname, "../../../../python/");
      const COMPOSIO_CACHE = getComposioDir(false);

      volumeBindings.push(
        ...[
          `${COMPOSIO_PATH}:/opt/composio-core:rw`,
          `${COMPOSIO_CACHE}:/root/.composio:rw`,
        ]
      );
    }

    const envBindings: Array<string> = Object.entries(this.environment).map(
      ([key, value]) => `${key}=${value}`
    );

    if (IS_DEV_MODE === "1") {
      envBindings.push(`${ENV_COMPOSIO_DEV_MODE}=1`);
    }

    return { exposedPorts, portBindings, volumeBindings, envBindings };
  }

  async setup() {
    this.port = await getFreePort();
    this.url = `http://localhost:${this.port}/api`;

    const images = await this.docker.listImages();
    const imageExists = images.some(
      (image: any) =>
        image.RepoTags &&
        image.RepoTags.find((tag: any) => tag.startsWith(this.image))
    );

    if (!imageExists) {
      logger.debug(`Pulling Docker image ${this.image}...`);
      const cliProgress = nodeExternalRequire("cli-progress");

      const bar: CliProgress.Bar = new cliProgress.SingleBar(
        {
          format: "{bar} | {percentage}% | {status}",
          hideCursor: true,
        },
        cliProgress.Presets.shades_classic
      );

      bar.start(100, 0, { status: "Initializing..." });
      bar.update({
        status: `Image ${this.image} not found locally. Pulling from Docker Hub...`,
      });
      await new Promise((resolve, reject) => {
        this.docker.pull(this.image, (err: any, stream: any) => {
          if (err) {
            bar.stop();
            logger.error("Failed to pull Docker image.");
            return reject(err);
          }
          this.docker.modem.followProgress(stream, onFinished, onProgress);

          function onFinished(err: any, output: any) {
            if (err) {
              bar.stop();
              logger.error("Failed to pull Docker image.");
              return reject(err);
            }
            bar.update(100, { status: "Docker image pulled successfully." });
            bar.stop();
            resolve(output);
          }

          function onProgress(event: any) {
            bar.update({ status: event.status });
          }
        });
      });
    } else {
      logger.debug(`Image ${this.image} found locally.`);
    }

    const containers = await this.docker.listContainers({ all: true });
    const existingContainer = containers.find((container: any) =>
      container.Names.find((name: any) => name.startsWith(`/composio-`))
    );

    if (existingContainer) {
      logger.debug(`Container with name ${this.id} is already running.`);
      this.container = this.docker.getContainer(existingContainer.Id);
      await this.container.restart();
      this.port = existingContainer.Ports.find(
        (port: any) => port.PrivatePort === 8000
      )?.PublicPort!;
      this.url = `http://localhost:${this.port}/api`;
    } else {
      const { exposedPorts, portBindings, volumeBindings, envBindings } =
        this.getBaseDockerConfig();
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
        ExposedPorts: exposedPorts,
        HostConfig: {
          PortBindings: portBindings,
          Binds: volumeBindings,
        },
        Env: envBindings,
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
      logger.debug(`Stopping container ${this.container.id}...`);
      try {
        await this.container.kill();
        await this.container.remove();
      } catch (error) {
        logger.debug("Failed to stop and remove container:", error);
      }
    }
  }
}
