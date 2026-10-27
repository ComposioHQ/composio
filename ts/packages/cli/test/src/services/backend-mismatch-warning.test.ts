import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, Option } from 'effect';
import type { BackendMismatch } from 'src/config/backend';
import { BackendMismatchWarning } from 'src/services/backend-mismatch-warning';
import { getTerminalCapabilities, TerminalUI } from 'src/services/terminal-ui';
import { ComposioUserContext } from 'src/services/user-context';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

const MISMATCH: BackendMismatch = {
  variable: 'COMPOSIO_BASE_URL',
  issuedBy: 'https://backend.composio.dev',
  selected: 'https://staging.composio.dev',
};

const MESSAGE =
  'COMPOSIO_BASE_URL sends your stored API key to https://staging.composio.dev, but it was issued by https://backend.composio.dev. ' +
  'Unset COMPOSIO_BASE_URL to use the backend you logged in to, or run `composio logout && composio login` to log in to https://staging.composio.dev instead.';

const userContext = (backendMismatch: Option.Option<BackendMismatch>) =>
  Layer.succeed(
    ComposioUserContext,
    ComposioUserContext.of({
      data: {
        apiKey: Option.some('uak_test'),
        baseURL: 'https://staging.composio.dev',
        webURL: 'https://platform.composio.dev',
        orgId: Option.none(),
        projectId: Option.none(),
        testUserId: Option.none(),
      },
      backendMismatch,
      isLoggedIn: () => true,
      logout: Effect.void,
      login: () => Effect.void,
      update: () => Effect.void,
    })
  );

/** A terminal whose stderr is (or is not) a TTY, recording warnings and plain stderr lines. */
const recordingTerminal = (stderrIsTTY: boolean) => {
  const written: Array<{ readonly via: 'log.warn' | 'error'; readonly text: string }> = [];
  const layer = Layer.succeed(
    TerminalUI,
    TerminalUI.of({
      ...terminalUITestImpl,
      capabilities: Effect.succeed(
        getTerminalCapabilities({
          stdin: { isTTY: false },
          stdout: { isTTY: false },
          stderr: { isTTY: stderrIsTTY },
        })
      ),
      error: text => Effect.sync(() => void written.push({ via: 'error', text })),
      log: {
        ...terminalUITestImpl.log,
        warn: text => Effect.sync(() => void written.push({ via: 'log.warn', text })),
      },
    })
  );
  return { layer, written };
};

const cases = [Option.none<BackendMismatch>(), Option.some(MISMATCH)].flatMap(backendMismatch =>
  [true, false].map(stderrIsTTY => ({
    backendMismatch,
    situation: Option.isNone(backendMismatch) ? 'no mismatch' : 'a mismatch',
    stderrIsTTY,
    expected: Option.isNone(backendMismatch)
      ? []
      : stderrIsTTY
        ? [{ via: 'log.warn', text: MESSAGE }]
        : [{ via: 'error', text: `Warning: ${MESSAGE}` }],
  }))
);

describe('BackendMismatchWarning', () => {
  it.effect.each(cases)(
    '[Given] $situation, stderr TTY $stderrIsTTY [Then] warns only on a mismatch, in the form stderr supports',
    ({ backendMismatch, stderrIsTTY, expected }) => {
      const terminal = recordingTerminal(stderrIsTTY);
      return Effect.gen(function* () {
        const warning = yield* BackendMismatchWarning;
        yield* warning.run({ argv: ['bun', 'composio', 'whoami'] });
        expect(terminal.written).toEqual(expected);
      }).pipe(
        Effect.provide(
          Layer.provide(
            BackendMismatchWarning.Default,
            Layer.mergeAll(userContext(backendMismatch), terminal.layer)
          )
        )
      );
    }
  );
});
