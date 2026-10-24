import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { afterEach, vi } from 'vitest';
import { runSignup } from 'src/commands/signup/signup.handler';
import type { AgentIdentity } from 'src/services/agents';
import { TerminalUI } from 'src/services/terminal-ui';
import { MockConsole, TestLive } from 'test/__utils__';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

const readyIdentity: AgentIdentity = {
  status: 'READY',
  slug: 'test-agent',
  email: 'test-agent@agent.composio.ai',
  composio_agent_key: 'cak_test_agent',
  composio: {
    member_id: 'mem_agent',
    org_id: 'org_agent',
    project_id: 'proj_agent',
    user_api_key: 'uak_agent',
  },
};

/** A headless terminal whose stdout payloads land in `outputs`. */
const capturingTest = () => {
  const outputs: Array<{ readonly data: string; readonly force: boolean }> = [];
  const terminalUI = TerminalUI.of({
    ...terminalUITestImpl,
    output: (data, options) =>
      Effect.sync(() => {
        outputs.push({ data, force: options?.force ?? false });
      }),
  });
  return { outputs, layer: TestLive({ terminalUI }) };
};

const noLogin = capturingTest();

describe('runSignup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  layer(noLogin.layer)(it => {
    it.effect(
      '[Given] --no-login [Then] names `composio signup` and prints the summary as data',
      () =>
        Effect.gen(function* () {
          vi.spyOn(globalThis, 'fetch').mockImplementation(
            async () =>
              new Response(JSON.stringify(readyIdentity), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
          );

          yield* runSignup({ noWait: false, noLogin: true, force: false });

          expect(yield* MockConsole.getLines({ stripAnsi: true })).toEqual([
            '-- composio signup --',
            'composio signup signs you up as a Composio agent. This flow is fully non-interactive and does not open a browser.',
            [
              '[Composio Agent] Type: agent',
              'Status: READY',
              'Email: test-agent@agent.composio.ai',
              'Slug: test-agent',
              'Current Org ID: org_agent',
              'Project ID: proj_agent',
              'Agent key: stored in ~/.composio/agent.json',
            ].join('\n'),
            '-- Agent setup complete. --',
          ]);
          expect(noLogin.outputs).toEqual([
            {
              data: JSON.stringify({
                account_type: 'agent',
                status: 'READY',
                slug: 'test-agent',
                email: 'test-agent@agent.composio.ai',
                org_id: 'org_agent',
                project_id: 'proj_agent',
                member_id: 'mem_agent',
                claimed_by: null,
                claimed_at: null,
                logged_in: false,
              }),
              force: false,
            },
          ]);
        })
    );
  });
});
