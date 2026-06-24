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
    // SECURITY: this is the developer's full *project* API key, placed in the
    // sandbox env. Any code or tool output in the sandbox can read it and
    // exfiltrate it, so treat the sandbox as your security boundary and rotate
    // this key. The execute endpoint also accepts a session-scoped
    // `x-session-access-key`; swapping to that (so the project key never enters
    // the sandbox) is the planned follow-up.
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
