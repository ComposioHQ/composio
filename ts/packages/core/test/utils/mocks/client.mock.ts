import { vi } from 'vitest';

export const mockClient = {
  tools: {
    list: vi.fn(),
    retrieve: vi.fn(),
    execute: vi.fn(),
    retrieveEnum: vi.fn(),
    getInput: vi.fn(),
    proxy: vi.fn(),
  },
  connectedAccounts: {
    list: vi.fn(),
    get: vi.fn(),
    retrieve: vi.fn(),
    delete: vi.fn(),
    refresh: vi.fn(),
    updateStatus: vi.fn(),
  },
  toolkits: {
    list: vi.fn(),
    retrieve: vi.fn(),
    retrieveCategories: vi.fn(),
  },
  authConfigs: {
    list: vi.fn(),
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
  },
  toolRouter: {
    session: {
      execute: vi.fn(),
      tools: vi.fn(),
    },
  },
};
