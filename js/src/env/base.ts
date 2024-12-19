import axios, { AxiosResponse } from "axios";
import { IPythonActionDetails } from "../sdk/types";
import { getEnvVariable } from "../utils/shared";
import { IWorkspaceConfig, WorkspaceConfig } from "./config";
import { getUUID } from "../utils/getUUID";

const ENV_GITHUB_ACCESS_TOKEN = "GITHUB_ACCESS_TOKEN";
const ENV_ACCESS_TOKEN = "ACCESS_TOKEN";
const ENV_COMPOSIO_API_KEY = "COMPOSIO_API_KEY";
const ENV_COMPOSIO_BASE_URL = "COMPOSIO_BASE_URL";

function _readEnvVar(name: string, defaultValue: string | null): string {
  const value = getEnvVariable(name, defaultValue!) || defaultValue;
  if (value === undefined) {
    throw new Error(`Please provide value for \`${name}\``);
  }
  return value as string;
}

class Shell {
  private _id: string;

  constructor() {
    this._id = getUUID();
  }

  sanitizeCommand(cmd: string): string {
    return `${cmd.trim()}\n`;
  }

  toString(): string {
    return `Shell(type=${this.constructor.name}, id=${this.id})`;
  }

  get id(): string {
    return this._id;
  }

  setup(): void {
    throw new Error("Method 'setup()' must be implemented.");
  }

  exec(cmd: string): void {
    throw new Error("Method 'exec()' must be implemented.");
  }

  stop(): void {
    throw new Error("Method 'stop()' must be implemented.");
  }
}

export class ShellFactory {
  private _factory: () => Shell;
  private _recent: Shell | null;
  private _shells: { [key: string]: Shell };

  constructor(factory: () => Shell) {
    this._factory = factory;
    this._recent = null;
    this._shells = {};
  }

  get recent(): Shell {
    return this._recent || this.new();
  }

  set recent(shell: Shell) {
    this._recent = shell;
  }

  new(): Shell {
    const shell = this._factory();
    shell.setup();
    this._shells[shell.id] = shell;
    this.recent = shell;
    return shell;
  }

  get(id: string | null = null): Shell {
    if (!id) {
      return this.recent;
    }
    if (!this._shells[id]) {
      throw new Error(`No shell found with ID: ${id}`);
    }
    const shell = this._shells[id];
    this.recent = shell;
    return shell;
  }

  exec(cmd: string, id: string | null = null): void {
    return this.get(id).exec(cmd);
  }

  stop(id: string): void {
    if (!this._shells[id]) {
      return;
    }
    const shell = this._shells[id];
    shell.stop();
    delete this._shells[id];
  }

  teardown(): void {
    Object.keys(this._shells).forEach((id) => {
      this._shells[id].stop();
      delete this._shells[id];
    });
    this._recent = null;
  }
}

export type IExecuteActionMetadata = {
  entityId?: string | null;
};

export class Workspace {
  id: string;
  accessToken: string;
  composioAPIKey: string;
  composioBaseURL: string;
  githubAccessToken: string;
  environment: { [key: string]: string };
  private _shell_factory: ShellFactory | undefined;

  constructor(configRepo: WorkspaceConfig<IWorkspaceConfig>) {
    this.id = getUUID();
    this.accessToken = getUUID().replace(/-/g, "");
    this.composioAPIKey = _readEnvVar(
      ENV_COMPOSIO_API_KEY,
      configRepo.config.composioAPIKey!
    );
    this.composioBaseURL =
      _readEnvVar(ENV_COMPOSIO_BASE_URL, configRepo.config.composioBaseURL!) +
      (configRepo.config.composioBaseURL!.endsWith("/api") ? "" : "/api");
    this.githubAccessToken =
      configRepo.config.githubAccessToken ||
      getEnvVariable(ENV_GITHUB_ACCESS_TOKEN, "NO_VALUE")!;
    this.environment = {
      ...(configRepo.config.environment || {}),
      [ENV_COMPOSIO_API_KEY]: this.composioAPIKey,
      [ENV_COMPOSIO_BASE_URL]: this.composioBaseURL,
      [ENV_GITHUB_ACCESS_TOKEN]: this.githubAccessToken,
      [`_COMPOSIO_${ENV_GITHUB_ACCESS_TOKEN}`]: this.githubAccessToken,
      [ENV_ACCESS_TOKEN]: this.accessToken,
    };
  }

  toString(): string {
    return `Workspace(type=${this.constructor.name}, id=${this.id})`;
  }

  setup(): void {
    throw new Error("Method 'setup()' must be implemented.");
  }

  get shells(): ShellFactory {
    if (!this._shell_factory) {
      this._shell_factory = new ShellFactory(() => this._createShell());
    }
    return this._shell_factory;
  }

  _createShell(): Shell {
    throw new Error("Method '_create_shell()' must be implemented.");
  }

  executeAction(
    action: any,
    request_data: any,
    metadata: IExecuteActionMetadata = {}
  ): Promise<Record<string, any>> {
    throw new Error("Method 'execute_action()' must be implemented.");
  }

  teardown(): void {
    this.shells.teardown();
  }
}

export class RemoteWorkspace extends Workspace {
  url: string;

  constructor(configRepo: WorkspaceConfig) {
    super(configRepo);
    this.url =
      configRepo.config.composioBaseURL! +
      (configRepo.config.composioBaseURL!.endsWith("/api") ? "" : "/api");
  }

  async _request(
    endpoint: string,
    method: string,
    json: any = null,
    timeout: number = 60000.0
  ): Promise<AxiosResponse> {
    return axios({
      url: `${this.url}${endpoint}`,
      method: method,
      data: json,
      headers: {
        "x-api-key": this.accessToken,
      },
      timeout: timeout,
    });
  }

  _createShell(): Shell {
    throw new Error("Creating shells for remote workspaces is not allowed.");
  }

  _upload(action: any): void {
    throw new Error("Method '_upload()' must be implemented.");
  }

  async getLocalActionsSchema(): Promise<IPythonActionDetails["data"]> {
    const request = await this._request("/local_actions", "get");
    return (request.data as IPythonActionDetails).data;
  }

  async executeAction(
    action: string,
    request_data: any,
    metadata: IExecuteActionMetadata = {}
  ): Promise<any> {
    if (!metadata.entityId) {
      metadata.entityId = "default";
    }
    const request = await this._request(`/actions/execute/${action}`, "post", {
      params: request_data,
      entity_id: metadata.entityId,
      metadata: metadata,
    });
    const response = request.data;

    if (!response.error) {
      return response.data;
    }
    if (response.error?.includes("Invalid value")) {
      return {
        status: "NOT_FOUND",
        error: `Action ${action} does not exist or supported.`,
        instructions: `Please only refer to the tools you have access to`,
      };
    }
    throw new Error(`Error while executing ${action}: ${response.error}`);
  }
}
