
import { E2BWorkspace } from "./e2b/workspace";
import { DockerWorkspace } from "./docker/workspace";
import { Workspace, WorkspaceConfig } from "./base";
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

    async new(env: ExecEnv, kwargs: WorkspaceConfig) {
        if (this.workspace) {
            return;
        }
        logger.debug(`Creating workspace with env=${env} and kwargs=${JSON.stringify(kwargs)}`);
        let workspace: Workspace | null = null;
        switch (env) {
            case ExecEnv.DOCKER:
                workspace = new DockerWorkspace(kwargs);
                await workspace.setup();
                break;
            case ExecEnv.HOST:
                console.warn("Local tools are not supported in host environment");
                break;
            case ExecEnv.E2B:
                workspace = new E2BWorkspace(kwargs);
                await workspace.setup();
                break;
            default:
                throw new Error(`Unknown environment: ${env}`);
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
