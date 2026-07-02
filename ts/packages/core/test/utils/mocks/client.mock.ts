import { vi } from 'vitest';

const mockClientBase = {
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

// `withOptions` returns the same mock so chained calls (e.g.
// `client.withOptions({ maxRetries: 0 }).tools.execute(...)`) still record on
// the same spies. Mirrors the real client's `withOptions`.
//
// This implementation is load-bearing: tests rely on `vi.clearAllMocks()`
// (which preserves implementations), not `vi.resetAllMocks()` (which would wipe
// it and make chained `.tools.*` calls throw on `undefined`).
export const mockClient = Object.assign(mockClientBase, {
  withOptions: vi.fn(() => mockClientBase),
});
