import { RemoteWorkspace } from "../base";
import { getUUID } from "../../utils/getUUID";
import { getEnvVariable, nodeExternalRequire } from "../../utils/shared";
import { Sandbox } from "e2b";
import { IWorkspaceConfig, WorkspaceConfig } from "../config";
import logger from "../../utils/logger";

const DEFAULT_TEMPLATE = "2h9ws7lsk32jyow50lqz";
const TOOLSERVER_PORT = 8000;
const TOOLSERVER_URL = "https://{host}/api";

const ENV_E2B_TEMPLATE = "E2B_TEMPLATE";

export type IE2BConfig = IWorkspaceConfig & {
  template?: string;
  apiKey?: string;
  port?: number;
};

export class E2BWorkspace extends RemoteWorkspace {
  sandbox: Sandbox | undefined;
  template: string;
  apiKey?: string;
  port: number;

  constructor(configRepo: WorkspaceConfig<IE2BConfig>) {
    super(configRepo);
    this.template =
      configRepo.config.template ||
      getEnvVariable(ENV_E2B_TEMPLATE, DEFAULT_TEMPLATE)!;
    this.apiKey = configRepo.config.apiKey;
    this.port = configRepo.config.port || TOOLSERVER_PORT;
  }

  async setup(): Promise<void> {
    this.sandbox = await Sandbox.create({
      template: this.template,
      envVars: this.environment,
      apiKey: this.apiKey,
    });

    this.url = TOOLSERVER_URL.replace(
      "{host}",
      await this.sandbox!.getHostname(this.port)
    );

    logger.debug("E2B Composio Server is live at " + this.url);

    const process = await this.sandbox!.process.start({
      cmd: "composio apps update",
    });

    await process.wait();

    const _ssh_username = getUUID().replace(/-/g, "");
    const _ssh_password = getUUID().replace(/-/g, "");

    await this.sandbox!.process.start({
      cmd: `sudo useradd -rm -d /home/${_ssh_username} -s /bin/bash -g root -G sudo ${_ssh_username}`,
    });

    await this.sandbox!.process.start({
      cmd: `echo ${_ssh_username}:${_ssh_password} | sudo chpasswd`,
    });

    await this.sandbox!.process.start({
      cmd: "sudo service ssh restart",
    });

    await this.sandbox!.process.start({
      cmd: `_SSH_USERNAME=${_ssh_username} _SSH_PASSWORD=${_ssh_password} COMPOSIO_LOGGING_LEVEL=debug composio serve -h '0.0.0.0' -p ${this.port}`,
    });

    await this.waitForSpinUp();
  }

  async waitForSpinUp() {
    const timeout = 2 * 60 * 1000; // 2 minutes in milliseconds
    const startTime = Date.now();
    let status = 0;

    while (status !== 200) {
      if (Date.now() - startTime > timeout) {
        await this.teardown();
        throw new Error("Timeout: Server did not spin up within 2 minutes");
      }

      try {
        status = (await this._request("", "get")).status;
      } catch (error) {}

      if (status !== 200) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  async teardown(): Promise<void> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized");
    }
    await super.teardown();
    await this.sandbox.close();
  }
}
