export type RuntimeCliInvocationContext = {
  readonly invocationOrigin: string;
  readonly parentRunId: string | undefined;
  readonly currentRunId: string | undefined;
};

let runtimeCliInvocationContext: RuntimeCliInvocationContext = {
  invocationOrigin: 'cli',
  parentRunId: undefined,
  currentRunId: undefined,
};

export const configureRuntimeCliInvocationContext = (context: {
  readonly invocationOrigin: string | undefined;
  readonly parentRunId: string | undefined;
}): void => {
  runtimeCliInvocationContext = {
    invocationOrigin: context.invocationOrigin ?? 'cli',
    parentRunId: context.parentRunId,
    currentRunId: undefined,
  };
};

export const setRuntimeCliRunId = (runId: string): void => {
  runtimeCliInvocationContext = {
    ...runtimeCliInvocationContext,
    currentRunId: runId,
  };
};

export const getRuntimeCliInvocationContext = (): RuntimeCliInvocationContext =>
  runtimeCliInvocationContext;
