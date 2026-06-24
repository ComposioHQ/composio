import { Composio } from '@composio/core';
import {
  experimental_createLocalWorkbenchSession,
  type LocalWorkbenchSession,
} from '@composio/core/experimental';
import type { AppConfig } from './config.js';

type ConnectedAccount = {
  id: string;
  status?: string;
};

export function createComposioClient(config: AppConfig): Composio {
  return new Composio({
    apiKey: config.composioApiKey,
    baseURL: config.composioBaseUrl,
  });
}

export async function getActiveGithubConnection(composio: Composio, userId: string): Promise<ConnectedAccount | undefined> {
  const list = (await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: ['github'],
    statuses: ['ACTIVE'],
  })) as { items?: ConnectedAccount[] };

  return list.items?.[0];
}

export async function createGithubConnectUrl(composio: Composio, userId: string): Promise<string> {
  const request = await composio.toolkits.authorize(userId, 'github');
  if (!request.redirectUrl) throw new Error('Composio did not return a GitHub connect URL');
  return request.redirectUrl;
}

export async function requireGithubConnection(composio: Composio, userId: string): Promise<ConnectedAccount> {
  const account = await getActiveGithubConnection(composio, userId);
  if (account) return account;

  const url = await createGithubConnectUrl(composio, userId);
  throw new Error(
    [
      `No active GitHub connection found for COMPOSIO_USER_ID="${userId}".`,
      'Open this URL, complete GitHub authorization, then run the reviewer again:',
      url,
    ].join('\n')
  );
}

export async function createLocalWorkbench(composio: Composio, userId: string): Promise<LocalWorkbenchSession> {
  return experimental_createLocalWorkbenchSession(composio, userId, {
    toolkits: ['github'],
  });
}
