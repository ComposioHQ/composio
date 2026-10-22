import { describe, expect, it } from '@effect/vitest';
import { Console, Effect, Layer } from 'effect';
import {
  PROJECTS_SWITCH_UNSUPPORTED_MESSAGE,
  runProjectsSwitch,
} from 'src/commands/projects/switch/projects.switch.handler';
import { TerminalUI } from 'src/services/terminal-ui';
import { MockConsole } from 'test/__utils__';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

describe('runProjectsSwitch', () => {
  it.effect('[Then] logs the `composio dev init` pointer and outputs no data', () => {
    const outputs: Array<string> = [];
    const layer = Layer.mergeAll(
      Layer.effect(Console.Console, MockConsole.make),
      Layer.succeed(
        TerminalUI,
        TerminalUI.of({
          ...terminalUITestImpl,
          output: data =>
            Effect.sync(() => {
              outputs.push(data);
            }),
        })
      )
    );
    return Effect.gen(function* () {
      yield* runProjectsSwitch();

      expect(outputs).toEqual([]);
      expect(yield* MockConsole.getLines()).toEqual([PROJECTS_SWITCH_UNSUPPORTED_MESSAGE]);
    }).pipe(Effect.provide(layer));
  });
});
