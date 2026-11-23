/**
 * A hand-authored path played with no model and no aimock.
 *
 * A hand-authored fixture is the path the skill teaches, written as one
 * fixture per model turn. Played in order, its `response` blocks are that
 * path; its `match` blocks only gate a replay on what the CLI printed, and are
 * not read here. `mutate.ts` plays a path with one command left out, which
 * aimock cannot serve: the next turn's `match` names the call that never ran.
 */

import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { ModelAdapter, ModelTurn } from './agent';
import { loopDriver, type Driver } from './run-journey';

const HandAuthoredFile = z.object({
  fixtures: z.array(
    z.object({
      response: z.object({
        content: z.string().optional(),
        toolCalls: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              arguments: z.looseObject({ command: z.string() }),
            })
          )
          .optional(),
      }),
    })
  ),
});

/** The model turns of a hand-authored file, in order. */
export const readScriptedPath = (path: string): ReadonlyArray<ModelTurn> =>
  HandAuthoredFile.parse(JSON.parse(readFileSync(path, 'utf8'))).fixtures.map(({ response }) => ({
    text: response.content ?? '',
    calls: (response.toolCalls ?? [])
      .filter(call => call.name === 'shell')
      .map(call => ({ id: call.id, command: call.arguments.command })),
  }));

/** The commands of a path, in the order they run. */
export const scriptedCommands = (turns: ReadonlyArray<ModelTurn>): string[] =>
  turns.flatMap(turn => turn.calls.map(call => call.command));

export const scriptedAdapter = (
  turns: ReadonlyArray<ModelTurn>,
  options: {
    /** The index, in `scriptedCommands(turns)`, of the one command not to run. */
    drop?: number;
  } = {}
): ModelAdapter => {
  let turn = 0;
  let command = 0;
  return {
    // Nothing speaks this path's wire format; the field only says which
    // provider an adapter was built for, and this one was built for none.
    provider: 'openai',
    model: 'scripted',
    next: async () => {
      const scripted = turns[turn];
      turn += 1;
      if (!scripted) return { text: '', calls: [], stopped: 'script-ended' };
      const calls = scripted.calls.flatMap(call => {
        const index = command;
        command += 1;
        return index === options.drop ? [] : [call];
      });
      return { text: scripted.text, calls };
    },
    // The path is fixed, so what the commands printed and what the person said
    // change nothing about the next turn.
    record: () => {},
    say: () => {},
    // A turn whose only command was dropped asks for nothing, which would end
    // the loop; the rest of the path still has to be played.
    hasMore: () => turn < turns.length,
  };
};

/**
 * The minimal loop driving a scripted path. Output is scrubbed as in a
 * replay, so the URLs the path's text names are the ones the person expects.
 */
export const scriptedDriver = (path: string, options: { drop?: number } = {}): Driver => {
  const turns = readScriptedPath(path);
  return loopDriver(() => scriptedAdapter(turns, options));
};
