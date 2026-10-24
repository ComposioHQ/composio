import type { ComposioClientShape } from '@composio/client/effect';
import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import { ConfigProvider, Console, Effect, Layer, Option } from 'effect';
import { HttpClient } from 'effect/http';
import * as tempy from 'tempy';
import { ComposioClientSingleton } from 'src/services/composio-clients';
import { NodeOs } from 'src/services/node-os';
import { NodeProcess } from 'src/services/node-process';
import { ProjectContext } from 'src/services/project-context';
import { TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { hostOnlyEnvConfigProvider } from '../live-env-config-provider';
import { makeSessionInfo } from '../models/account';
import * as MockConsole from '../services/mock-console';
import { terminalUITestImpl } from '../services/terminal-ui-test';
import type { MockRequestScope } from './accounts';
import { ToolkitsTest } from './toolkits';
import { makeShadowClient } from './shadow-client';

/** What the CLI is logged in with when an agent handler test starts. */
export interface AgentHandlerFixture {
  /** The stored user API key; omitted means logged out. */
  readonly apiKey?: string;
}

/** One `ui.output` call: the stdout payload and whether it bypassed the TTY check. */
export interface AgentHandlerOutput {
  readonly data: string;
  readonly force: boolean;
}

const clientFor = (scope: MockRequestScope): ComposioClientShape =>
  // The shadows answer only the fields `loginWithAgentIdentity` reads; `test-layer.ts` shadows
  // its mock client the same way.
  makeShadowClient(
    {
      sessionInfo: makeSessionInfo({
        orgId: scope.orgId ?? 'org_agent',
        orgName: 'Agent Org',
        orgMemberId: 'mem_agent',
        email: 'agent@agent.composio.ai',
      }),
    },
    scope
  );

/**
 * What an `agent` handler needs without argv or `TestLive`: a headless terminal whose stdout
 * payloads land in `outputs` (decoration goes to `MockConsole`), a user context that records
 * `login` calls, the real filesystem under a temporary home (where `~/.composio/agent.json`
 * lives), and the services the agent login step reaches (session info for the analytics
 * link, and the consumer-toolkits cache refresh it starts in the background). The agents API
 * itself is plain `fetch`; tests stub it with `vi.spyOn(globalThis, 'fetch')`.
 */
export const AgentHandlerTest = (fixture: AgentHandlerFixture = {}) => {
  const outputs: Array<AgentHandlerOutput> = [];
  const logins: Array<{ readonly apiKey: string; readonly orgId?: string }> = [];
  const apiKey = Option.fromUndefinedOr(fixture.apiKey);
  const homedir = tempy.temporaryDirectory({ prefix: 'agent-handler' });

  const layer = Layer.mergeAll(
    Layer.effect(Console.Console, MockConsole.make),
    Layer.succeed(
      TerminalUI,
      TerminalUI.of({
        ...terminalUITestImpl,
        output: (data, options) =>
          Effect.sync(() => {
            outputs.push({ data, force: options?.force ?? false });
          }),
      })
    ),
    Layer.succeed(
      ComposioUserContext,
      ComposioUserContext.of({
        data: {
          apiKey,
          baseURL: 'https://mock.invalid',
          webURL: 'https://platform.mock.invalid/',
          orgId: Option.none(),
          projectId: Option.none(),
          testUserId: Option.none(),
        },
        backendMismatch: Option.none(),
        isLoggedIn: () => Option.isSome(apiKey),
        logout: Effect.void,
        login: (loginApiKey, orgId) =>
          Effect.sync(() => {
            logins.push({ apiKey: loginApiKey, orgId });
          }),
        update: () => Effect.void,
      })
    ),
    Layer.succeed(
      ComposioClientSingleton,
      ComposioClientSingleton.of({
        get: () => Effect.succeed(clientFor({})),
        getFor: (scope: MockRequestScope) => Effect.succeed(clientFor(scope)),
        getMetrics: () => Effect.succeed({ byteSize: 0, requests: 0 }),
      })
    ),
    ToolkitsTest(),
    Layer.succeed(ProjectContext, ProjectContext.of({ resolve: Effect.succeed(Option.none()) })),
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(request =>
        Effect.die(new Error(`unexpected HTTP call from an agent handler test: ${request.url}`))
      )
    ),
    BunFileSystem.layer,
    BunPath.layer,
    Layer.succeed(
      NodeOs,
      NodeOs.of({ homedir, tmpdir: homedir, arch: 'arm64', platform: 'darwin' })
    ),
    Layer.succeed(
      NodeProcess,
      NodeProcess.of({
        cwd: homedir,
        execPath: `${homedir}/composio`,
        platform: 'darwin',
        arch: 'arm64',
        // Agent handler tests read the exit code off the real process.
        setExitCode: code =>
          Effect.sync(() => {
            process.exitCode = code;
          }),
      })
    ),
    ConfigProvider.layer(hostOnlyEnvConfigProvider)
  );
  return { layer, outputs, logins };
};
