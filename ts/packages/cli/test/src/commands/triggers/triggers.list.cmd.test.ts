import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import type { TriggerTypes } from 'src/models/trigger-types';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';

const testTriggerTypes: TriggerTypes = [
  {
    slug: 'GMAIL_NEW_GMAIL_MESSAGE',
    name: 'NEW_GMAIL_MESSAGE',
    description: 'Fires when a new message arrives in Gmail',
    instructions: 'Connect Gmail and subscribe to this trigger',
    toolkit: { name: 'Gmail', slug: 'gmail' },
    type: 'webhook',
    config: { type: 'object', properties: {} },
    payload: { type: 'object', properties: {} },
  },
  {
    slug: 'GMAIL_NEW_LABEL',
    name: 'NEW_LABEL',
    description: 'Fires when a new label is created in Gmail',
    instructions: 'Connect Gmail and subscribe to this trigger',
    toolkit: { name: 'Gmail', slug: 'gmail' },
    type: 'poll',
    config: { type: 'object', properties: {} },
    payload: { type: 'object', properties: {} },
  },
  {
    slug: 'SLACK_NEW_MESSAGE',
    name: 'NEW_MESSAGE',
    description: 'Fires when a new message is posted in Slack',
    instructions: 'Connect Slack and subscribe to this trigger',
    toolkit: { name: 'Slack', slug: 'slack' },
    type: 'webhook',
    config: { type: 'object', properties: {} },
    payload: { type: 'object', properties: {} },
  },
];

const testToolkits = makeTestToolkits([
  { name: 'Gmail', slug: 'gmail' },
  { name: 'Slack', slug: 'slack' },
]);

const toolkitsData = {
  toolkits: testToolkits,
  triggerTypes: testTriggerTypes,
} satisfies TestLiveInput['toolkitsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio dev triggers list', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] root triggers list [Then] lists trigger types with root-level hint',
    it => {
      it.scoped('supports the top-level triggers list entrypoint', () =>
        Effect.gen(function* () {
          yield* cli(['triggers', 'list', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('GMAIL_NEW_GMAIL_MESSAGE');
          expect(output).toContain('Listing 2 trigger types');
          expect(output).toContain('composio triggers info');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] root triggers list with nonexistent toolkit [Then] shows root toolkit hint',
    it => {
      it.scoped('uses root toolkit command in the no-results hint', () =>
        Effect.gen(function* () {
          yield* cli(['triggers', 'list', 'nonexistent']).pipe(Effect.ignore);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('not available');
          expect(output).toContain('composio toolkits list');
          expect(output).not.toContain('composio dev toolkits list');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] no toolkit [Then] parse fails because toolkit is required',
    it => {
      it.scoped('requires a toolkit positional argument', () =>
        Effect.gen(function* () {
          const exit = yield* cli(['triggers', 'list']).pipe(Effect.exit);
          expect(JSON.stringify(exit)).toContain('toolkit');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] no flags [Then] lists all trigger types',
    it => {
      it.scoped('lists all trigger types', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'list', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('GMAIL_NEW_GMAIL_MESSAGE');
          expect(output).not.toContain('SLACK_NEW_MESSAGE');
          expect(output).toContain('Listing 2 trigger types');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] toolkit "gmail" [Then] lists only gmail trigger types',
    it => {
      it.scoped('filters by toolkit', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'list', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('GMAIL_NEW_GMAIL_MESSAGE');
          expect(output).toContain('GMAIL_NEW_LABEL');
          expect(output).not.toContain('SLACK_NEW_MESSAGE');
          expect(output).toContain('Listing 2 trigger types');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --limit 1 [Then] lists one trigger type with singular grammar',
    it => {
      it.scoped('uses singular form for one result', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'list', 'gmail', '--limit', '1']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Listing 1 trigger type');
          expect(output).not.toContain('Listing 1 trigger types');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] no flags [Then] shows next step hint',
    it => {
      it.scoped('shows hint to view trigger details', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'list', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('composio dev triggers info');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'triggers', 'list', 'gmail']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      toolkitsData: { toolkits: makeTestToolkits([{ name: 'Gmail', slug: 'gmail' }]) },
    })
  )('[Given] empty results [Then] shows no trigger types found', it => {
    it.scoped('shows no trigger types found', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'triggers', 'list', 'gmail']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('No trigger types found');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] toolkit "nonexistent" [Then] shows invalid toolkit error with hint',
    it => {
      it.scoped('shows hint about verifying toolkit slug', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'list', 'nonexistent']).pipe(Effect.ignore);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('not available');
          expect(output).toContain('composio dev toolkits list');
        })
      );
    }
  );
});
