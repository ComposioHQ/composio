import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, Layer } from 'effect';
import { runDebugWhoIsMyMaster } from 'src/commands/debug/who-is-my-master/debug.who-is-my-master.handler';
import { TerminalUI } from 'src/services/terminal-ui';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

/** A headless terminal whose stdout data lands in `outputs`, over exactly `env`. */
const masterTest = (env: Record<string, string>) => {
  const outputs: Array<string> = [];
  const layer = Layer.mergeAll(
    Layer.succeed(
      TerminalUI,
      TerminalUI.of({
        ...terminalUITestImpl,
        output: data =>
          Effect.sync(() => {
            outputs.push(data);
          }),
      })
    ),
    ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))
  );
  return { layer, outputs };
};

describe('runDebugWhoIsMyMaster', () => {
  it.effect.each<{
    readonly name: string;
    readonly env: Record<string, string>;
    readonly master: string;
  }>([
    { name: 'a CODEX_* variable', env: { CODEX_HOME: '/codex' }, master: 'codex' },
    { name: 'a CLAUDE_* variable', env: { CLAUDE_CODE_ENTRYPOINT: 'cli' }, master: 'claude' },
    {
      name: 'both (Codex wins)',
      env: { CODEX_HOME: '/codex', CLAUDE_CODE_ENTRYPOINT: 'cli' },
      master: 'codex',
    },
    { name: 'neither', env: {}, master: 'user' },
  ])('[Given] $name [Then] prints `$master`', ({ env, master }) => {
    const { layer, outputs } = masterTest(env);
    return Effect.gen(function* () {
      yield* runDebugWhoIsMyMaster();

      expect(outputs).toEqual([JSON.stringify({ master }, null, 2)]);
    }).pipe(Effect.provide(layer));
  });
});
