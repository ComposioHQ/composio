import { v4 as uuidv4 } from "uuid";
import { RemoteWorkspace } from "../base";
import { getEnvVariable, nodeExternalRequire } from "../../utils/shared";
import { Sandbox } from "e2b";
import { IWorkspaceConfig, WorkspaceConfig } from "../config";

const DEFAULT_TEMPLATE = "2h9ws7lsk32jyow50lqz";
const TOOLSERVER_PORT = 8000;
const TOOLSERVER_URL = "https://{host}/api";

const ENV_E2B_TEMPLATE = "E2B_TEMPLATE";

export interface IE2BConfig extends IWorkspaceConfig {
    template?: string;
    apiKey?: string;
    port?: number;
}

export class E2BWorkspace extends RemoteWorkspace {
    sandbox: Sandbox | undefined;
    template: string;
    apiKey?: string;
    port: number;

    constructor(configRepo: WorkspaceConfig<IE2BConfig>) {
        super(configRepo);
        this.template = configRepo.config.template || getEnvVariable(ENV_E2B_TEMPLATE, DEFAULT_TEMPLATE)!;
        this.apiKey = configRepo.config.apiKey;
        this.port = configRepo.config.port || TOOLSERVER_PORT;
    }

    async setup(): Promise<void> {
        this.sandbox = new Sandbox({
            template: this.template,
            envVars: this.environment,
            apiKey: this.apiKey,
        });

        this.url = TOOLSERVER_URL.replace("{host}", await this.sandbox!.getHostname(this.port));

        const process = await this.sandbox!.process.start({
            cmd: "composio apps update",
        });

        const _ssh_username = uuidv4().replace(/-/g, "");
        const _ssh_password = uuidv4().replace(/-/g, "");

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

        while ((await this._request("", "get")).status !== 200) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        await process.wait();
    }

    async teardown(): Promise<void> {
        if (!this.sandbox) {
            throw new Error("Sandbox not initialized");
        }
        await super.teardown();
        await this.sandbox.close();
    }
}
