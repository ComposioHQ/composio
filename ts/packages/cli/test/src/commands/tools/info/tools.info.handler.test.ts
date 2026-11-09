import { describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, Layer, Option } from 'effect';
import { isUsageFailure } from 'src/commands/errors';
import { runToolsInfo } from 'src/commands/tools/info/tools.info.handler';
import {
  MISSING_SLUG_HINT,
  MISSING_SLUG_MESSAGE,
  toolNotFoundMessage,
} from 'src/commands/tools/info/tools.info.format';
import type { Tools } from 'src/models/tools';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { MockConsole, TestLive } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';
import { makeToolkitsRepositoryStub } from 'test/__utils__/services/toolkits-repository-stub';

const TOOLS: Tools = [
  {
    name: 'Send Email',
    slug: 'GMAIL_SEND_EMAIL',
    description: 'Sends an email',
    tags: ['email'],
    available_versions: ['20260101_00'],
    input_parameters: {
      type: 'object',
      properties: { recipient: { type: 'string' } },
      required: ['recipient'],
    },
    output_parameters: { type: 'object', properties: {} },
  },
];

/**
 * The `TestLive` stack with the tool catalog above and a terminal whose stdout data lands in
 * `outputs`; `runToolsInfo` is called without argv.
 */
const toolsInfoTest = () => {
  const outputs: Array<string> = [];
  const layer = TestLive({
    baseConfigProvider: ConfigProvider.fromEnv({
      env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
    }),
    toolkitsData: { tools: TOOLS },
    terminalUI: TerminalUI.of({
      ...terminalUITestImpl,
      output: data =>
        Effect.sync(() => {
          outputs.push(data);
        }),
    }),
  });
  return { layer, outputs };
};

describe('runToolsInfo', () => {
  it.effect('[Given] no slug [Then] fails with a usage error before any request', () => {
    const { layer, outputs } = toolsInfoTest();
    return Effect.gen(function* () {
      const failure = yield* runToolsInfo({ slug: Option.none() }).pipe(
        // Every repository method dies, so reaching the API fails the test.
        Effect.provide(Layer.succeed(ComposioToolkitsRepository, makeToolkitsRepositoryStub({}))),
        Effect.flip
      );

      expect(failure).toMatchObject({
        _tag: 'commands/CommandInputError',
        command: 'tools info',
        option: '<slug>',
        message: `${MISSING_SLUG_MESSAGE}\n${MISSING_SLUG_HINT}`,
      });
      // The invocation prints a usage failure on stderr and exits 1.
      expect(isUsageFailure(failure)).toBe(true);
      expect(yield* MockConsole.getLines()).toEqual([]);
      expect(outputs).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] a known slug [Then] prints the tool and its cached input schema', () => {
    const { layer, outputs } = toolsInfoTest();
    return Effect.gen(function* () {
      yield* runToolsInfo({ slug: Option.some('GMAIL_SEND_EMAIL') });

      expect(outputs).toHaveLength(1);
      const printed = JSON.parse(outputs[0] ?? '{}') as Record<string, unknown>;
      expect(Object.keys(printed)).toEqual([
        'slug',
        'name',
        'description',
        'toolkit',
        'version',
        'schemaPath',
        'inputSchema',
      ]);
      expect(printed).toMatchObject({
        slug: 'GMAIL_SEND_EMAIL',
        name: 'Send Email',
        description: 'Sends an email',
        toolkit: 'gmail',
        inputSchema: TOOLS[0]?.input_parameters,
      });
      expect(printed.schemaPath).toMatch(/\/tool_definitions\/GMAIL_SEND_EMAIL\.json$/);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] an unknown slug [Then] reports it with suggestions, prints nothing, and exits 1',
    () => {
      const { layer, outputs } = toolsInfoTest();
      return Effect.gen(function* () {
        const exit = yield* Effect.exit(runToolsInfo({ slug: Option.some('GMAIL_SEND') }));
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain(toolNotFoundMessage('GMAIL_SEND'));
        expect(output).toContain('> composio tools info "GMAIL_SEND_EMAIL"');
        expect(outputs).toEqual([]);
        expect(exitCodeOf(exit)).toBe(1);
      }).pipe(Effect.provide(layer));
    }
  );
});
