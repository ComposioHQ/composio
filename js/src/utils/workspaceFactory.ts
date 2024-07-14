
import { v4 as uuidv4 } from "uuid";
import { Sandbox } from "@e2b/sdk";
import axios from 'axios';
import { E2BWorkspace } from "../env/e2b/workspace";

const DEFAULT_TEMPLATE = "2h9ws7lsk32jyow50lqz";
const TOOLSERVER_PORT = 8000;
const TOOLSERVER_URL = "https://{host}/api";

const ENV_GITHUB_ACCESS_TOKEN = "GITHUB_ACCESS_TOKEN";
const ENV_ACCESS_TOKEN = "ACCESS_TOKEN";
const ENV_E2B_TEMPLATE = "E2B_TEMPLATE";

export enum ExecEnv {
    DOCKER = "docker",
    E2B = "e2b"
}

export class WorkspaceFactory {
    workspace: E2BWorkspace;
    id: string;

    constructor(env: ExecEnv, kwargs: any) {
        console.debug(`Creating workspace with env=${env} and kwargs=${JSON.stringify(kwargs)}`);
        let workspace: E2BWorkspace;
        switch (env) {
            case ExecEnv.DOCKER:
                throw new Error("Not implemented");
            case ExecEnv.E2B:
                workspace = new E2BWorkspace(kwargs);
                break;
            default:
                throw new Error(`Unknown environment: ${env}`);
        }

        this.workspace = workspace;
        this.id = workspace.id;
    }

    async get(id: string | null = null): Promise<E2BWorkspace> {
        return this.workspace;
    }

    async close(id: string): Promise<void> {
        await this.workspace.teardown();
    }
}
