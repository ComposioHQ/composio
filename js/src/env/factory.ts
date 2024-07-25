
import { E2BWorkspace } from "./e2b/workspace";
import { DockerWorkspace } from "./docker/workspace";
import { Workspace } from "./base";
import { WorkspaceConfig } from "./config";
import logger from "../utils/logger";

export enum ExecEnv {
    HOST = "HOST",
    DOCKER = "DOCKER",
    E2B = "E2B"
}

export class WorkspaceFactory {
    workspace: Workspace | null = null;
    id: string | null = null;

    env: ExecEnv;
    kwargs: WorkspaceConfig;

    constructor(env: ExecEnv, kwargs: WorkspaceConfig) {
        this.env = env;
        this.kwargs = kwargs;
    }

    async new() {
        if (this.workspace) {
            return;
        }
        logger.debug(`Creating workspace with env=${env} and kwargs=${JSON.stringify(kwargs)}`);
        let workspace: Workspace | null = null;
        switch (this.kwargs.env) {
            case ExecEnv.DOCKER:
                workspace = new DockerWorkspace(this.kwargs);
                await workspace.setup();
                break;
            case ExecEnv.HOST:
                console.warn("Local tools are not supported in host environment");
                break;
            case ExecEnv.E2B:
                workspace = new E2BWorkspace(this.kwargs);
                await workspace.setup();
                break;
            default:
                throw new Error(`Unknown environment: ${this.kwargs.env}`);
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
