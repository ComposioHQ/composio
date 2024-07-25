import { v4 as uuidv4 } from "uuid";
import { RemoteWorkspace, WorkspaceConfig } from "../base";
import { getEnvVariable, nodeExternalRequire } from "../../utils/shared";
import type {Sandbox} from "@e2b/sdk";

const DEFAULT_TEMPLATE = "2h9ws7lsk32jyow50lqz";
const TOOLSERVER_PORT = 8000;
const TOOLSERVER_URL = "https://{host}/api";

const ENV_E2B_TEMPLATE = "E2B_TEMPLATE";

interface Config extends WorkspaceConfig {
    template?: string;
    api_key?: string;
    port?: number;
}

export class E2BWorkspace extends RemoteWorkspace {
    sandbox: Sandbox | undefined;
    template: string;
    api_key?: string;
    port: number;

    constructor(config: Config) {
        super(config);
        this.template = config.template || getEnvVariable(ENV_E2B_TEMPLATE, DEFAULT_TEMPLATE)!;
        this.api_key = config.api_key;
        this.port = config.port || TOOLSERVER_PORT;
    }

    async setup(): Promise<void> {
        const { Sandbox } = nodeExternalRequire("@e2b/sdk");
        this.sandbox = new Sandbox({
            template: this.template,
            envVars: this.environment,
            apiKey: this.api_key,
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
