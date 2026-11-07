import { Auth, make, type ComposioClientShape } from '@composio/client/effect';
import { Effect } from 'effect';
import { HttpClient } from 'effect/http';
import { mockAccountResources, type AccountTestData, type MockRequestScope } from './accounts';

// A resource the account mocks do not shadow reaches this transport and dies with its URL.
const baseClient = make(
  { auth: Auth.project('test'), baseURL: 'https://mock.invalid' },
  HttpClient.make(request =>
    Effect.die(new Error(`unexpected network call from a shadowed test client: ${request.url}`))
  )
);

/**
 * A Composio client whose account resources answer from `mockAccountResources` and whose
 * unshadowed resources die loudly, so a handler test can never reach the network. Callers
 * supply only the account data their handler reads; `test-layer.ts` shadows its mock client
 * the same way.
 */
export const makeShadowClient = (
  accountData: AccountTestData,
  scope: MockRequestScope
): ComposioClientShape =>
  ({
    ...baseClient,
    ...mockAccountResources(accountData, scope),
  }) as unknown as ComposioClientShape;
