import { ExecEnv } from "./factory";
import { IDockerConfig } from "./docker/workspace";
import { IE2BConfig } from "./e2b/workspace";
import { IWorkspaceConfig, WorkspaceConfig } from "./config";

export class Workspace {
  static Docker(config: IDockerConfig = {}) {
    return new WorkspaceConfig(ExecEnv.DOCKER, config as IDockerConfig);
  }

  static E2B(config: IE2BConfig = {}) {
    return new WorkspaceConfig(ExecEnv.E2B, config as IE2BConfig);
  }

  static Host() {
    return new WorkspaceConfig(ExecEnv.HOST, {});
  }
}
