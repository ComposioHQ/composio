import { E2BWorkspace } from "./e2b/workspace";
import { DockerWorkspace } from "./docker/workspace";
import { Workspace } from "./base";
import { WorkspaceConfig } from "./config";
import logger from "../utils/logger";

export enum ExecEnv {
  HOST = "HOST",
  DOCKER = "DOCKER",
  E2B = "E2B",
}

export class WorkspaceFactory {
  workspace: Workspace | null = null;
  id: string | null = null;

  env: ExecEnv;
  workspaceConfig: WorkspaceConfig;

  constructor(env: ExecEnv, kwargs: WorkspaceConfig) {
    this.env = env;
    this.workspaceConfig = kwargs;
  }

  async new() {
    if (this.workspace) {
      return;
    }

    const sanitizedConfig = {
      ...this.workspaceConfig,
      host: this.workspaceConfig.config.composioBaseURL,
      composioAPIKey: this.workspaceConfig.config.composioAPIKey
        ? "REDACTED"
        : "NOT DEFINED",
    };
    logger.debug("Creating workspace with config", sanitizedConfig);

    let workspace: Workspace | null = null;
    switch (this.workspaceConfig.env) {
      case ExecEnv.DOCKER:
        workspace = new DockerWorkspace(this.workspaceConfig);
        await workspace.setup();
        break;
      case ExecEnv.HOST:
        break;
      case ExecEnv.E2B:
        workspace = new E2BWorkspace(this.workspaceConfig);
        await workspace.setup();
        break;
      default:
        throw new Error(`Unknown environment: ${this.workspaceConfig.env}`);
    }

    if (workspace) {
      this.workspace = workspace;
      this.id = workspace.id;
    }
  }

  async get(id: string | null = null): Promise<Workspace> {
    return this.workspace!;
  }

  async close(): Promise<void> {
    await this.workspace?.teardown();
  }
}
