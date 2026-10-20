import { describe, expect, it } from 'vitest';
import { Option } from 'effect';
import { consumerUserIdOf } from 'src/commands/debug/api-info/debug.api-info.handler';
import type { ResolvedCommandProject } from 'src/services/command-project';

const project = (overrides: Partial<ResolvedCommandProject>): ResolvedCommandProject => ({
  orgId: 'org_1',
  projectId: 'project_1',
  projectType: 'CONSUMER',
  source: 'consumer-default',
  ...overrides,
});

describe('debug api-info handler: consumerUserIdOf', () => {
  // Only a consumer project carries the playground user the API key acts for.
  it.each([
    { name: 'no project', input: Option.none(), expected: null },
    {
      name: 'a consumer project with a user',
      input: Option.some(project({ consumerUserId: 'consumer-user-org_1' })),
      expected: 'consumer-user-org_1',
    },
    { name: 'a consumer project without a user', input: Option.some(project({})), expected: null },
    {
      name: 'a developer project with a user',
      input: Option.some(project({ projectType: 'DEVELOPER', consumerUserId: 'ignored' })),
      expected: null,
    },
  ])('[Given] $name [Then] returns $expected', ({ input, expected }) => {
    expect(consumerUserIdOf(input)).toBe(expected);
  });
});
