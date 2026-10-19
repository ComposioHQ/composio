import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import * as tempy from 'tempy';
import { runArtifactsCwd } from 'src/commands/artifacts/cwd/artifacts.cwd.handler';
import { TerminalUI } from 'src/services/terminal-ui';
import { TestLive } from 'test/__utils__';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

const sessionRoot = tempy.temporaryDirectory();
const outputs: Array<{ readonly data: string; readonly force: boolean | undefined }> = [];

describe('runArtifactsCwd', () => {
  layer(
    TestLive({
      baseConfigProvider: ConfigProvider.fromEnvRecord({ COMPOSIO_SESSION_DIR: sessionRoot }),
      terminalUI: TerminalUI.of({
        ...terminalUITestImpl,
        output: (data, options) =>
          Effect.sync(() => {
            outputs.push({ data, force: options?.force });
          }),
      }),
    })
  )(it => {
    it.effect('[Then] forces the directory onto stdout even when it is a terminal', () =>
      Effect.gen(function* () {
        yield* runArtifactsCwd();

        expect(outputs).toEqual([{ data: sessionRoot, force: true }]);
      })
    );
  });
});
