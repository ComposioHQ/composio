import { describe, it } from '@effect/vitest';
import { deepStrictEqual } from '@effect/vitest/utils';
import { Config, ConfigProvider, Effect } from 'effect';
import { HOST_CONFIG } from 'src/config';

const read = <A>(config: Config.Config<A>, env: Record<string, string>) =>
  config.parse(ConfigProvider.fromEnvRecord(env));

describe('HOST_CONFIG', () => {
  it.effect('[Then] it normalizes host values into runtime facts', () =>
    Effect.gen(function* () {
      const actual = yield* read(Config.all(HOST_CONFIG), {
        SHELL: '/bin/zsh',
        PATH: '/usr/bin:/bin',
        npm_config_user_agent: 'pnpm/9.0.0 npm/? node/v22.0.0 darwin arm64',
        CI: ' TRUE ',
        NO_COLOR: '1',
        CLAUDECODE: '1',
        CODEX_THREAD_ID: 'thread_test',
        CLAUDE_CONFIG_DIR: '  ',
        COMPOSIO_CALLER_AGENT: 'Open-Claw',
        VITEST: 'off',
      });
      deepStrictEqual(actual, {
        SHELL: '/bin/zsh',
        PATH: '/usr/bin:/bin',
        NPM_CONFIG_USER_AGENT: 'pnpm/9.0.0 npm/? node/v22.0.0 darwin arm64',
        NO_COLOR: true,
        CI_REDACTION_ENABLED: true,
        INTERACTIVE_PERMISSION_UI_DISABLED: true,
        AGENT_HOST: {
          claudeCode: '1',
          codexThreadId: 'thread_test',
          codexSandbox: undefined,
          claudeConfigDir: undefined,
          codexHome: undefined,
        },
        MASTER_SIGNALS: { codex: true, claude: true },
        CALLER_AGENT_SIGNALS: { explicit: 'Open-Claw', codex: true, claude: true, openclaw: false },
      });
    })
  );

  it.effect('[Then] CI redaction keys off the exact `CI=true` convention only', () =>
    Effect.gen(function* () {
      deepStrictEqual(yield* read(HOST_CONFIG.CI_REDACTION_ENABLED, { CI: '1' }), false);
      deepStrictEqual(yield* read(HOST_CONFIG.CI_REDACTION_ENABLED, { CI: 'true' }), true);
    })
  );

  it.effect('[Then] an explicit permission UI value overrides CI and Vitest detection', () =>
    Effect.gen(function* () {
      const disabled = HOST_CONFIG.INTERACTIVE_PERMISSION_UI_DISABLED;
      deepStrictEqual(yield* read(disabled, {}), false);
      deepStrictEqual(yield* read(disabled, { CI: '1' }), true);
      deepStrictEqual(yield* read(disabled, { VITEST: 'true' }), true);
      deepStrictEqual(
        yield* read(disabled, {
          COMPOSIO_DISABLE_PERMISSION_UI: 'false',
          CI: 'true',
          VITEST: 'true',
        }),
        false
      );
      deepStrictEqual(yield* read(disabled, { COMPOSIO_DISABLE_PERMISSION_UI: '1' }), true);
    })
  );
});
