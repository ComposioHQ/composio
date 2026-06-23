export const COMPOSIO_WORKBENCH_HELPER_PATH = '/tmp/composio-tools.ts';

export interface WorkbenchEnvOptions {
  sessionId?: string;
  backendUrl: string;
  apiKey?: string;
}

export interface WorkbenchHelperSourceOptions {
  sessionId?: string;
  backendUrl?: string;
  apiKey?: string;
}

export function experimental_createWorkbenchEnv(env: WorkbenchEnvOptions): Record<string, string> {
  return {
    BACKEND_URL: env.backendUrl,
    ...(env.sessionId ? { COMPOSIO_TOOLROUTER_SESSION_ID: env.sessionId } : {}),
    ...(env.apiKey ? { COMPOSIO_API_KEY: env.apiKey } : {}),
  };
}

function sourceValue(value: string | undefined): string {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

export function experimental_createWorkbenchHelperSource(
  opts: WorkbenchHelperSourceOptions = {}
): string {
  return String.raw`type ComposioToolArguments = Record<string, unknown>;

const DEFAULT_SESSION_ID = ${sourceValue(opts.sessionId)};
const DEFAULT_BACKEND_URL = ${sourceValue(opts.backendUrl)};
const DEFAULT_API_KEY = ${sourceValue(opts.apiKey)};

function readEnv(name: string): string | undefined {
  const globalProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return globalProcess.process?.env?.[name];
}

function requireValue(name: string, fallback?: string): string {
  const value = fallback ?? readEnv(name);
  if (!value) {
    throw new Error('Missing required Composio workbench environment variable: ' + name);
  }
  return value;
}

export async function runComposioTool(
  slug: string,
  args: ComposioToolArguments = {}
): Promise<unknown> {
  const backendUrl = requireValue('BACKEND_URL', DEFAULT_BACKEND_URL).replace(/\/+$/, '');
  const sessionId = requireValue('COMPOSIO_TOOLROUTER_SESSION_ID', DEFAULT_SESSION_ID);
  const projectApiKey = requireValue('COMPOSIO_API_KEY', DEFAULT_API_KEY);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': projectApiKey,
  };

  const response = await fetch(
    backendUrl + '/api/v3/tool_router/session/' + encodeURIComponent(sessionId) + '/execute',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tool_slug: slug,
        arguments: args,
      }),
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error('Composio tool execution failed: ' + response.status + ' ' + text);
  }
  const body = text ? JSON.parse(text) : undefined;
  return body;
}
`;
}
