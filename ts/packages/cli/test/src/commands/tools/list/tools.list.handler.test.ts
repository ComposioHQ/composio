import { describe, expect, it } from '@effect/vitest';
import { Console, Effect, Layer, Option } from 'effect';
import { runToolsList, type ToolsListParams } from 'src/commands/tools/list/tools.list.handler';
import { noToolsFoundMessage } from 'src/commands/tools/list/tools.list.format';
import type { Tools } from 'src/models/tools';
import {
  ComposioToolkitsRepository,
  type ComposioToolkitsRepositoryShape,
} from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { MockConsole } from 'test/__utils__';
import { resolveToolkitsTestData, toolkitCatalogMethods } from 'test/__utils__/layers/toolkits';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';
import { makeToolkitsRepositoryStub } from 'test/__utils__/services/toolkits-repository-stub';

const tool = (slug: string, name: string, tags: ReadonlyArray<string> = []): Tools[number] => ({
  slug,
  name,
  description: `${name} description`,
  tags: [...tags],
  available_versions: ['20260101_00'],
  input_parameters: { type: 'object', properties: {} },
  output_parameters: { type: 'object', properties: {} },
});

const TOOLS: Tools = [
  tool('GMAIL_SEND_EMAIL', 'Send Email', ['email']),
  tool('GMAIL_CREATE_DRAFT', 'Create Draft', ['email']),
  tool('GMAIL_FETCH_EMAILS', 'Fetch Emails'),
];

type SearchToolsParams = Parameters<ComposioToolkitsRepositoryShape['searchTools']>[0];

/**
 * What `runToolsList` reads: the tool catalog, whose `searchTools` requests land in
 * `requests`, and a headless terminal whose stdout data lands in `outputs`.
 */
const toolsListTest = (tools: Tools = TOOLS) => {
  const outputs: Array<string> = [];
  const requests: Array<SearchToolsParams> = [];
  const catalog = toolkitCatalogMethods(resolveToolkitsTestData({ tools }));
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
    ),
    Layer.succeed(
      ComposioToolkitsRepository,
      makeToolkitsRepositoryStub({
        searchTools: params =>
          Effect.suspend(() => {
            requests.push(params);
            return catalog.searchTools(params);
          }),
      })
    )
  );
  return { layer, outputs, requests };
};

const params = (overrides: Partial<ToolsListParams> = {}): ToolsListParams => ({
  toolkit: 'gmail',
  query: Option.none(),
  tags: Option.none(),
  limit: 30,
  ...overrides,
});

describe('runToolsList', () => {
  it.effect('[Given] filters [Then] passes them to the catalog search as given', () => {
    const { layer, requests } = toolsListTest();
    return Effect.gen(function* () {
      yield* runToolsList(
        params({ query: Option.some('send'), tags: Option.some('email,important') })
      );

      expect(requests).toEqual([
        { search: 'send', toolkit_slug: 'gmail', tags: 'email,important', limit: 30 },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect.each([
    { limit: 0, expected: 1 },
    { limit: -3, expected: 1 },
    { limit: 1001, expected: 1000 },
  ])('[Given] limit $limit [Then] requests $expected tools', ({ limit, expected }) => {
    const { layer, requests } = toolsListTest();
    return Effect.gen(function* () {
      yield* runToolsList(params({ limit }));

      expect(requests.map(request => request.limit)).toEqual([expected]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] one page of tools [Then] lists them and prints them as JSON', () => {
    const { layer, outputs } = toolsListTest();
    return Effect.gen(function* () {
      yield* runToolsList(params());
      const lines = yield* MockConsole.getLines({ stripAnsi: true });

      expect(lines[0]).toBe('Fetching tools...');
      expect(lines[1]).toMatch(/^Listing 3 tools\n\n/);
      expect(lines[2]).toBe('To inspect a tool:\n> composio tools info "GMAIL_SEND_EMAIL"');
      expect(outputs.map(output => JSON.parse(output))).toEqual([
        [
          {
            slug: 'GMAIL_SEND_EMAIL',
            name: 'Send Email',
            description: 'Send Email description',
            tags: ['email'],
          },
          {
            slug: 'GMAIL_CREATE_DRAFT',
            name: 'Create Draft',
            description: 'Create Draft description',
            tags: ['email'],
          },
          {
            slug: 'GMAIL_FETCH_EMAILS',
            name: 'Fetch Emails',
            description: 'Fetch Emails description',
            tags: [],
          },
        ],
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] more tools than the limit [Then] names the first of several pages', () => {
    const { layer, outputs } = toolsListTest();
    return Effect.gen(function* () {
      yield* runToolsList(params({ limit: 2 }));
      const lines = yield* MockConsole.getLines({ stripAnsi: true });

      expect(lines[1]).toMatch(/^Listing 2 tools \(page 1 of 2\)\n\n/);
      expect(JSON.parse(outputs[0] ?? '[]')).toHaveLength(2);
    }).pipe(Effect.provide(layer));
  });

  it.effect.each(['gmail', 'custom_grain'])(
    '[Given] no tools in toolkit %s [Then] warns and prints nothing on stdout',
    toolkit => {
      const { layer, outputs } = toolsListTest([]);
      return Effect.gen(function* () {
        yield* runToolsList(params({ toolkit }));

        expect(outputs).toEqual([]);
        expect(yield* MockConsole.getLines({ stream: 'stderr' })).toEqual([
          noToolsFoundMessage(toolkit),
        ]);
      }).pipe(Effect.provide(layer));
    }
  );
});
