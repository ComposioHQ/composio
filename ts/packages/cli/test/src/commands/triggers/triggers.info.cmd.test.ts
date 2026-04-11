import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import type { TriggerTypes } from 'src/models/trigger-types';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';

const testTriggerTypes: TriggerTypes = [
  {
    slug: 'GMAIL_NEW_GMAIL_MESSAGE',
    name: 'NEW_GMAIL_MESSAGE',
    description: 'Fires when a new message arrives in Gmail',
    instructions: 'Connect Gmail and subscribe to this trigger',
    toolkit: { name: 'Gmail', slug: 'gmail' },
    type: 'webhook',
    config: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Label filter for inbox messages' },
        include_spam: {
          type: 'boolean',
          description: 'Include spam messages',
          default: false,
        },
      },
      required: ['label'],
    },
    payload: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Email subject line' },
        from: { type: 'string', description: 'Sender email address' },
      },
      required: ['subject'],
    },
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

const toolkitsData = {
  triggerTypes: testTriggerTypes,
} satisfies TestLiveInput['toolkitsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio dev triggers info', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] root triggers info [Then] displays trigger info with root-level hint',
    it => {
      it.scoped('supports the top-level triggers info entrypoint', () =>
        Effect.gen(function* () {
          yield* cli(['triggers', 'info', 'GMAIL_NEW_GMAIL_MESSAGE']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('GMAIL_NEW_GMAIL_MESSAGE');
          expect(output).toContain('composio triggers list "gmail"');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] valid slug [Then] displays trigger type info',
    it => {
      it.scoped('shows trigger details with config and payload fields', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'info', 'GMAIL_NEW_GMAIL_MESSAGE']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('NEW_GMAIL_MESSAGE');
          expect(output).toContain('GMAIL_NEW_GMAIL_MESSAGE');
          expect(output).toContain('Config Fields');
          expect(output).toContain('label');
          expect(output).toContain('required');
          expect(output).toContain('Payload Fields');
          expect(output).toContain('subject');
          expect(output).toContain('default:');
          expect(output).toContain('false');
          expect(output).toContain('composio dev triggers list "gmail"');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] no slug [Then] warns missing argument',
    it => {
      it.scoped('shows missing argument warning', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'info']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Missing required argument');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] invalid slug [Then] shows not found hint',
    it => {
      it.scoped('shows not found fallback hint', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'info', 'NONEXISTENT_TRIGGER']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('not found');
          expect(output).toContain('composio dev triggers list "<toolkit>"');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'triggers', 'info', 'GMAIL_NEW_GMAIL_MESSAGE']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });
});
