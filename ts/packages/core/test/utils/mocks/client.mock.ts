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
  },
  toolkits: {
    retrieve: vi.fn(),
  },
  toolRouter: {
    session: {
      executeMeta: vi.fn(),
    },
  },
};
