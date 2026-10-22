import { afterEach, describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
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

const testConfigProvider = ConfigProvider.fromEnv({
  env: { COMPOSIO_USER_API_KEY: 'test_api_key' },
});

describe('CLI: composio dev triggers info', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] root triggers info [Then] displays trigger info with root-level hint',
    it => {
      it.effect('supports the top-level triggers info entrypoint', () =>
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
      it.effect('shows trigger details with config and payload fields', () =>
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
    '[Given] no slug [Then] fails with a usage error',
    it => {
      it.effect('raises a CommandInputError naming <slug>', () =>
        Effect.gen(function* () {
          const failure = yield* cli(['dev', 'triggers', 'info']).pipe(Effect.flip);

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            command: 'dev triggers info',
            option: '<slug>',
            message:
              'Missing required argument: <slug>\nTry specifying a trigger slug, e.g.:\n> composio dev triggers info "GMAIL_NEW_GMAIL_MESSAGE"',
          });
          expect(yield* MockConsole.getLines()).toEqual([]);
        })
      );

      it.effect('names the root command on the root tree', () =>
        Effect.gen(function* () {
          const failure = yield* cli(['triggers', 'info']).pipe(Effect.flip);

          expect(failure).toMatchObject({
            _tag: 'commands/CommandInputError',
            command: 'triggers info',
            message: expect.stringContaining('> composio triggers info "GMAIL_NEW_GMAIL_MESSAGE"'),
          });
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] invalid slug [Then] shows not found hint',
    it => {
      it.effect('shows not found fallback hint', () =>
        Effect.gen(function* () {
          yield* cli(['dev', 'triggers', 'info', 'NONEXISTENT_TRIGGER']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('not found');
          expect(output).toContain('composio dev triggers list "<toolkit>"');
          // One plain stderr emission: the message, then the hint.
          expect(lines).toEqual([
            'Trigger "NONEXISTENT_TRIGGER" not found.',
            'Browse available trigger types:\n> composio dev triggers list "<toolkit>"',
          ]);
          expect(process.exitCode).toBe(1);
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.effect('warns user to login', () =>
      Effect.gen(function* () {
        const error = yield* cli(['dev', 'triggers', 'info', 'GMAIL_NEW_GMAIL_MESSAGE']).pipe(
          Effect.flip
        );
        expect(error).toMatchObject({ _tag: 'commands/NotLoggedInError' });
      })
    );
  });
});
