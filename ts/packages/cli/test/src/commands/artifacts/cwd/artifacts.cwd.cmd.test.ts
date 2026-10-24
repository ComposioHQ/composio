import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import * as Path from 'effect/Path';
import * as tempy from 'tempy';
import { NodeOs } from 'src/services/node-os';
import { cli, MockConsole, TestLive } from 'test/__utils__';

const sessionRoot = tempy.temporaryDirectory();

describe('CLI: composio artifacts cwd', () => {
  layer(
    TestLive({
      baseConfigProvider: ConfigProvider.fromEnvRecord({ COMPOSIO_SESSION_DIR: sessionRoot }),
    })
  )('[Given] no CLI session for the cwd and `COMPOSIO_SESSION_DIR`', it => {
    it.effect('[Then] prints the artifacts root on stdout', () =>
      Effect.gen(function* () {
        yield* cli(['artifacts', 'cwd']);

        expect(yield* MockConsole.getLines({ stream: 'stdout' })).toEqual([sessionRoot]);
        expect(yield* MockConsole.getLines({ stream: 'stderr' })).toEqual([]);
      })
    );
  });

  layer(TestLive())('[Given] no CLI session and no configured root', it => {
    it.effect('[Then] prints `composio` under the temporary directory', () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const os = yield* NodeOs;
        yield* cli(['artifacts', 'cwd']);

        expect(yield* MockConsole.getLines({ stream: 'stdout' })).toEqual([
          path.join(os.tmpdir, 'composio'),
        ]);
      })
    );
  });

  layer(
    TestLive({
      // The fixture stores a login with a current org, so the consumer scope resolves and a
      // session is bound to the cwd.
      fixture: 'user-config-with-global-context',
      baseConfigProvider: ConfigProvider.fromEnvRecord({
        COMPOSIO_SESSION_DIR: sessionRoot,
        COMPOSIO_DISABLE_CONNECTED_ACCOUNT_CACHE: 'false',
      }),
    })
  )('[Given] a CLI session bound to the cwd', it => {
    it.effect('[Then] prints that session directory under the artifacts root', () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        yield* cli(['artifacts', 'cwd']);

        const [directoryPath] = yield* MockConsole.getLines({ stream: 'stdout' });
        expect(path.dirname(directoryPath ?? '')).toBe(sessionRoot);
        expect(path.basename(directoryPath ?? '')).toMatch(/^cli_s_[a-z0-9]+_[a-f0-9]{10}$/i);
      })
    );
  });
});
