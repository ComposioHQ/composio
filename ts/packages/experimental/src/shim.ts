export const COMPOSIO_WORKBENCH_HELPER_PATH = '/tmp/composio-tools.ts';

export interface WorkbenchHelperEnv {
  sessionId: string;
  backendUrl: string;
  apiKey?: string;
  workbenchAccessKey?: string;
}

export function experimental_createWorkbenchHelperSource(): string {
  return String.raw`type ComposioToolArguments = Record<string, unknown>;

function readEnv(name: string): string | undefined {
  const globalProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return globalProcess.process?.env?.[name];
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error('Missing required Composio workbench environment variable: ' + name);
  }
  return value;
}

export async function runComposioTool(
  slug: string,
  args: ComposioToolArguments = {}
): Promise<unknown> {
  const backendUrl = requireEnv('BACKEND_URL').replace(/\/+$/, '');
  const sessionId = requireEnv('COMPOSIO_TOOLROUTER_SESSION_ID');
  const workbenchAccessKey = readEnv('COMPOSIO_WORKBENCH_ACCESS_KEY');
  const projectApiKey = readEnv('COMPOSIO_API_KEY');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (workbenchAccessKey) {
    headers['x-session-access-key'] = workbenchAccessKey;
  } else if (projectApiKey) {
    headers['x-api-key'] = projectApiKey;
  } else {
    throw new Error('Missing COMPOSIO_WORKBENCH_ACCESS_KEY or COMPOSIO_API_KEY for Composio tool execution.');
  }

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
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error('Composio tool execution failed: ' + response.status + ' ' + text);
  }
  return body;
}
`;
}

export function experimental_createWorkbenchEnv(env: WorkbenchHelperEnv): Record<string, string> {
  return {
    BACKEND_URL: env.backendUrl,
    COMPOSIO_TOOLROUTER_SESSION_ID: env.sessionId,
    ...(env.workbenchAccessKey ? { COMPOSIO_WORKBENCH_ACCESS_KEY: env.workbenchAccessKey } : {}),
    ...(env.apiKey ? { COMPOSIO_API_KEY: env.apiKey } : {}),
  };
}
