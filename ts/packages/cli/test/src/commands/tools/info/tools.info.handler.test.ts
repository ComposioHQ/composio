import { afterEach, describe, expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, Option } from 'effect';
import { runToolsInfo } from 'src/commands/tools/info/tools.info.handler';
import {
  MISSING_SLUG_HINT,
  MISSING_SLUG_MESSAGE,
  toolNotFoundMessage,
} from 'src/commands/tools/info/tools.info.format';
import type { Tools } from 'src/models/tools';
import { TerminalUI } from 'src/services/terminal-ui';
import { MockConsole, TestLive } from 'test/__utils__';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';

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
  afterEach(() => {
    process.exitCode = undefined;
  });

  it.effect('[Given] no slug [Then] warns with an example and keeps exit code 0', () => {
    const { layer, outputs } = toolsInfoTest();
    return Effect.gen(function* () {
      yield* runToolsInfo({ slug: Option.none() });

      expect(yield* MockConsole.getLines()).toEqual([MISSING_SLUG_MESSAGE, MISSING_SLUG_HINT]);
      expect(outputs).toEqual([]);
      expect(process.exitCode).toBeUndefined();
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
      expect(process.exitCode).toBeUndefined();
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] an unknown slug [Then] reports it with suggestions, prints nothing, and exits 1',
    () => {
      const { layer, outputs } = toolsInfoTest();
      return Effect.gen(function* () {
        yield* runToolsInfo({ slug: Option.some('GMAIL_SEND') });
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        expect(output).toContain(toolNotFoundMessage('GMAIL_SEND'));
        expect(output).toContain('> composio tools info "GMAIL_SEND_EMAIL"');
        expect(outputs).toEqual([]);
        expect(process.exitCode).toBe(1);
      }).pipe(Effect.provide(layer));
    }
  );
});
