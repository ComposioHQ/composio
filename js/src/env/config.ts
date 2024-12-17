import { ExecEnv } from "./factory";

export type IWorkspaceConfig = {
  composioAPIKey?: string | null;
  composioBaseURL?: string | null;
  githubAccessToken?: string | null;
  environment?: { [key: string]: string };
};

export class WorkspaceConfig<
  TConfig extends IWorkspaceConfig = IWorkspaceConfig,
> {
  env: ExecEnv;
  config: TConfig;

  constructor(env: ExecEnv, config: TConfig) {
    this.config = config;
    this.env = env;
  }
}
