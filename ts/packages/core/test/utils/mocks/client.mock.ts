import { vi } from 'vitest';
import ComposioClient from '@composio/client';

const client = new ComposioClient({ apiKey: 'test-api-key' });

const tools = Object.assign(client.tools, {
  list: vi.fn<typeof client.tools.list>(),
  retrieve: vi.fn<typeof client.tools.retrieve>(),
  execute: vi.fn<typeof client.tools.execute>(),
  retrieveEnum: vi.fn<typeof client.tools.retrieveEnum>(),
  getInput: vi.fn<typeof client.tools.getInput>(),
  proxy: vi.fn<typeof client.tools.proxy>(),
});

const connectedAccounts = Object.assign(client.connectedAccounts, {
  list: vi.fn<typeof client.connectedAccounts.list>(),
  create: vi.fn<typeof client.connectedAccounts.create>(),
  retrieve: vi.fn<typeof client.connectedAccounts.retrieve>(),
  delete: vi.fn<typeof client.connectedAccounts.delete>(),
  refresh: vi.fn<typeof client.connectedAccounts.refresh>(),
  updateStatus: vi.fn<typeof client.connectedAccounts.updateStatus>(),
});

const toolkits = Object.assign(client.toolkits, {
  list: vi.fn<typeof client.toolkits.list>(),
  retrieve: vi.fn<typeof client.toolkits.retrieve>(),
  retrieveCategories: vi.fn<typeof client.toolkits.retrieveCategories>(),
});

const authConfigs = Object.assign(client.authConfigs, {
  list: vi.fn<typeof client.authConfigs.list>(),
  create: vi.fn<typeof client.authConfigs.create>(),
  retrieve: vi.fn<typeof client.authConfigs.retrieve>(),
  update: vi.fn<typeof client.authConfigs.update>(),
  delete: vi.fn<typeof client.authConfigs.delete>(),
  updateStatus: vi.fn<typeof client.authConfigs.updateStatus>(),
});

const session = Object.assign(client.toolRouter.session, {
  execute: vi.fn<typeof client.toolRouter.session.execute>(),
  tools: vi.fn<typeof client.toolRouter.session.tools>(),
});
const toolRouter = Object.assign(client.toolRouter, { session });
const withOptions = vi.fn<typeof client.withOptions>();

export const mockClient = Object.assign(client, {
  tools,
  connectedAccounts,
  toolkits,
  authConfigs,
  toolRouter,
  withOptions,
});

withOptions.mockReturnValue(mockClient);
