import { v4 as uuidv4 } from "uuid";
import { Sandbox } from "@e2b/code-interpreter";
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
	sandbox: Sandbox | null = null;
	url: string | null = null;
	id: string | null = null;
    options: any;
    isReady: boolean = false;

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
			console.log(`Warning: Please set GITHUB_ACCESS_TOKEN environment variable to allow github functionality inside sandbox environment`);
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
        this.options = options;
	}

	async new() {
		this.sandbox = await Sandbox.create({
			template: this.options.template,
			envVars: {
				...this.options.env,
				COMPOSIO_API_KEY: this.apiKey,
				COMPOSIO_BASE_URL: this.baseUrl,
				GITHUB_ACCESS_TOKEN: this.githubAccessToken,
				ACCESS_TOKEN: this.accessToken,
			},
            onStdout: (data: any) => {
                console.log(data);
            },
            onStderr: (data: any) => {
                console.log(data);
            },
            onExit: (code: any, signal: any) => {
                console.log(`Process exited with code ${code} and signal ${signal}`);
            }
		} as any);
		this.id = this.sandbox.id;
		this.url = TOOLSERVER_URL.replace("{host}", this.sandbox.getHostname(this.port));
		await this._startToolserver();
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
        console.log(`Starting toolserver on port ${this.port}`);
		await this.sandbox?.process.startAndWait("composio apps update");
        console.log(`Starting toolserver on port ${this.port}`);
		await this.sandbox?.process.start(`composio serve --host 0.0.0.0 --port ${this.port}`);
        console.log(`Toolserver started on port ${this.port}`);

		let retries = 0;
		const maxRetries = 10;
		while (retries < maxRetries) {
			try {
				const response = await this._request("", "get");
				if (response.status === 200) {
                    this.isReady = true;
					break;
				}
			} catch (error) {
				console.error(`Error checking toolserver status: ${error}`);
			}
			retries++;
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
		if (retries === maxRetries) {
			throw new Error("Failed to start toolserver after multiple retries");
		}
	}

	_createShell() {
		throw new Error("Creating shells for `E2B` workspaces is not allowed.");
	}

	async _upload(action: any) {
		console.log(`Uploading ${action.slug} actions not supported for JS SDK`);
	}

	async executeAction(action: any, requestData: any) {
		while (!this.isReady) {
			await new Promise(resolve => setTimeout(resolve, 200));
		}
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
		this.sandbox?.close();
	}
}
