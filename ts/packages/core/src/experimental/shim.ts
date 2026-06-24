import { PYTHON_WORKBENCH_HELPER_SOURCE } from './python-workbench-helper-source';

export interface WorkbenchEnvOptions {
  sessionId: string;
  backendUrl: string;
  apiKey: string;
}

export interface PythonWorkbenchHelperSourceOptions {
  invokeLlmModel?: string;
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}

export function experimental_createWorkbenchEnv(env: WorkbenchEnvOptions): Record<string, string> {
  return {
    BACKEND_URL: trimTrailingSlashes(env.backendUrl),
    COMPOSIO_TOOLROUTER_SESSION_ID: env.sessionId,
    COMPOSIO_API_KEY: env.apiKey,
  };
}

export function experimental_createPythonWorkbenchHelperSource(
  opts: PythonWorkbenchHelperSourceOptions = {}
): string {
  return PYTHON_WORKBENCH_HELPER_SOURCE.replace(
    '__COMPOSIO_INVOKE_LLM_MODEL__',
    JSON.stringify(opts.invokeLlmModel ?? 'openai/gpt-oss-120b')
  );
}
