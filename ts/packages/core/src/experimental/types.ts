import type { Session, ToolRouterCreateSessionConfig } from '../types/toolRouter.types';

export type LocalWorkbenchConfig = ToolRouterCreateSessionConfig;

export interface LocalWorkbenchSession {
  session: Session<unknown, unknown, never>;
  helperSource: string;
  env: Record<string, string>;
}
