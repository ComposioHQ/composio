import { runAgentSignupFlow } from 'src/effects/agent-signup';

/** The flags of `composio agent signup`. */
export type AgentSignupParams = {
  readonly noWait: boolean;
  readonly noLogin: boolean;
  readonly force: boolean;
};

/** Runs the agent signup flow `composio signup` shares, under this command's name. */
export const runAgentSignup = (params: AgentSignupParams) =>
  runAgentSignupFlow({ ...params, commandLabel: 'composio agent signup' });
