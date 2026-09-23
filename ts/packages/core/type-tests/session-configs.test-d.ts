/**
 * Type-level tests for saved Session configs.
 *
 * These tests fail the build (tsconfig.type-tests.json) if the public read
 * types drift from the generated client.
 */
import type {
  SessionConfigsListResponse,
  SessionConfigsRetrieveResponse,
} from '@composio/client/resources/session-configs';
import {
  Composio,
  type SessionConfig,
  type SessionConfigListResponse,
  type SessionConfigPolicy,
  type SessionConfigSummary,
} from '../src';

declare const composio: Composio;

async function reads(): Promise<void> {
  const page: SessionConfigListResponse = await composio.sessionConfigs.list();
  const nextCursor: string | null = page.nextCursor;
  void nextCursor;
  await composio.sessionConfigs.list({ search: 'Daily', archived: true, limit: 50, cursor: 'c1' });
  // @ts-expect-error limit is a number
  await composio.sessionConfigs.list({ limit: '10' });

  const sessionConfig: SessionConfig = await composio.sessionConfigs.get('sc_1', {
    signal: new AbortController().signal,
  });
  const description: string | null = sessionConfig.description;
  void description;
}

// The SDK policy and the client policy are mutually assignable.
function policyMatchesClient(
  clientPolicy: SessionConfigsRetrieveResponse['config'],
  sdkPolicy: SessionConfigPolicy
): void {
  const _fromClient: SessionConfigPolicy = clientPolicy;
  const _toClient: SessionConfigsRetrieveResponse['config'] = sdkPolicy;
  void _fromClient;
  void _toClient;
}

// Every client list item field has a camelCased SDK counterpart.
function summaryMatchesClient(item: SessionConfigsListResponse.Item): SessionConfigSummary {
  return {
    id: item.id,
    name: item.name,
    archived: item.archived,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

void reads;
void policyMatchesClient;
void summaryMatchesClient;
