import { v4 as uuidv4 } from "uuid";
import { Sandbox } from "@e2b/sdk";
import axios from 'axios';

const DEFAULT_TEMPLATE = "2h9ws7lsk32jyow50lqz";
const TOOLSERVER_PORT = 8000;
const TOOLSERVER_URL = "https://{host}/api";

const DUMMY_GITHUB_ACCESS_TOKEN = "GITHUB_ACCESS_TOKEN";

export class E2BWorkspace {
    apiKey: string;
    baseUrl: string;
    githubAccessToken: string;
    accessToken: string;
    port: number;
    sandbox: Sandbox;
    url: string;
    id: string;

    constructor(options: {
        apiKey?: string | null,
        baseUrl?: string | null,
        template?: string | null,
        port?: number | null,
        env?: Record<string, string> | null
    } = {}) {
        this.apiKey = options.apiKey || process.env.COMPOSIO_API_KEY!;
        if (!this.apiKey) {
            throw new Error("`apiKey` cannot be `None` when initializing E2BWorkspace");
        }

        this.baseUrl = options.baseUrl || process.env.COMPOSIO_BASE_URL!;
        if (!this.baseUrl) {
            throw new Error("`baseUrl` cannot be `None` when initializing E2BWorkspace");
        }

        this.githubAccessToken = process.env.GITHUB_ACCESS_TOKEN!;
        if (!this.githubAccessToken) {
            throw new Error(`Please export your github access token as \`${DUMMY_GITHUB_ACCESS_TOKEN}\``);
        }

        
        if (!options.template) {
            options.template = process.env.E2B_TEMPLATE!;
            if (options.template) {
                console.debug(`Using E2B template \`${options.template}\` from environment`);
            }
            options.template = options.template || DEFAULT_TEMPLATE!;
        }

        this.accessToken = uuidv4().replace(/-/g, '');
        this.port = options.port || TOOLSERVER_PORT;
        this.sandbox = new Sandbox({
            template: options.template,
            envVars: {
                ...options.env,
                ENV_COMPOSIO_API_KEY: this.apiKey,
                ENV_COMPOSIO_BASE_URL: this.baseUrl,
                ENV_GITHUB_ACCESS_TOKEN: this.githubAccessToken,
                ENV_ACCESS_TOKEN: this.accessToken,
            }
        });
        this.id = this.sandbox.id;
        this.url = TOOLSERVER_URL.replace("{host}", this.sandbox.getHostname(this.port));
        this._startToolserver();
    }

    async _request(endpoint : string, method : string, json : any | null = null, timeout = 15000) {
        const config = {
            url: `${this.url}${endpoint}`,
            method: method,
            headers: {
                "x-api-key": this.accessToken,
            },
            timeout: timeout,
            data: json
        };
        return axios(config);
    }

    async _startToolserver() {
        await this.sandbox.process.startAndWait("composio apps update");
        await this.sandbox.process.start(`composio serve --host 0.0.0.0 --port ${this.port}`);
        while ((await this._request("", "get")).status !== 200) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    _createShell() {
        throw new Error("Creating shells for `E2B` workspaces is not allowed.");
    }

    async _upload(action: any) {
        console.log(`Uploading ${action.slug} actions not supported for JS SDK`);
    }

    async executeAction(action: any, requestData: any) {
        // @TODO: isRuntime is not supported from JS SDK at the moment
        if (action.isRuntime) {
            await this._upload(action);
        }

        const request = await this._request(
            `/actions/execute/${action.slug}`,
            "post",
            { params: requestData }
        );
        const response = request.data;
        if (!response.error) {
            return response.data;
        }
        throw new Error(`Error while executing ${action.slug}: ${response.error}`);
    }

    teardown() {
        this.sandbox.close();
    }
}
