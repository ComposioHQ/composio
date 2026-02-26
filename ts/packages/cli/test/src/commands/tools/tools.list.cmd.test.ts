import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { Tools } from 'src/models/tools';

const testTools: Tools = [
  {
    name: 'Send Email',
    slug: 'GMAIL_SEND_EMAIL',
    description: 'Sends an email to a recipient using Gmail',
    tags: ['messaging', 'email'],
    available_versions: ['20260101_00'],
    input_parameters: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Email address' },
        body: { type: 'string', description: 'Email body' },
      },
      required: ['recipient', 'body'],
    },
    output_parameters: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: 'Message ID' },
      },
    },
  },
  {
    name: 'Create Draft',
    slug: 'GMAIL_CREATE_DRAFT',
    description: 'Creates a draft email in Gmail',
    tags: ['messaging', 'email'],
    available_versions: ['20260101_00'],
    input_parameters: { type: 'object', properties: {} },
    output_parameters: { type: 'object', properties: {} },
  },
  {
    name: 'Send Message',
    slug: 'SLACK_SEND_MESSAGE',
    description: 'Sends a message to a Slack channel',
    tags: ['messaging'],
    available_versions: ['20260101_00'],
    input_parameters: { type: 'object', properties: {} },
    output_parameters: { type: 'object', properties: {} },
  },
];

const toolkitsData = {
  tools: testTools,
} satisfies TestLiveInput['toolkitsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio tools list', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] no flags [Then] lists all tools',
    it => {
      it.scoped('lists all tools', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('GMAIL_SEND_EMAIL');
          expect(output).toContain('SLACK_SEND_MESSAGE');
          expect(output).toContain('Listing 3 tools');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --toolkits "gmail" [Then] lists only gmail tools',
    it => {
      it.scoped('filters by toolkit', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'list', '--toolkits', 'gmail']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('GMAIL_SEND_EMAIL');
          expect(output).toContain('GMAIL_CREATE_DRAFT');
          expect(output).not.toContain('SLACK_SEND_MESSAGE');
          expect(output).toContain('Listing 2 tools');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --query "send" [Then] shows filtered results',
    it => {
      it.scoped('filters by search query', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'list', '--query', 'send']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('GMAIL_SEND_EMAIL');
          expect(output).toContain('SLACK_SEND_MESSAGE');
          expect(output).not.toContain('GMAIL_CREATE_DRAFT');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --limit 2 [Then] respects limit',
    it => {
      it.scoped('respects limit', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'list', '--limit', '2']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Listing 2 tools');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['tools', 'list']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))(
    '[Given] empty results [Then] shows no tools found',
    it => {
      it.scoped('shows no tools found', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'list']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('No tools found');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --tags "email" [Then] filters by tag',
    it => {
      it.scoped('filters by tag', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'list', '--tags', 'email']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('GMAIL_SEND_EMAIL');
          expect(output).toContain('GMAIL_CREATE_DRAFT');
          expect(output).not.toContain('SLACK_SEND_MESSAGE');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] --toolkits "nonexistent" [Then] shows no tools found with hint',
    it => {
      it.scoped('shows hint about verifying toolkit slug', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'list', '--toolkits', 'nonexistent']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('No tools found');
          expect(output).toContain('composio toolkits list');
        })
      );
    }
  );
});
