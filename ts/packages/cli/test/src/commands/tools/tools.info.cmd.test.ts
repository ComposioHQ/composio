import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import type { TestLiveInput } from 'test/__utils__/services/test-layer';
import type { Tools } from 'src/models/tools';

const parseLastJson = (lines: ReadonlyArray<string>) => {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line) continue;
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      // continue
    }
  }
  throw new Error('Expected JSON output but none found');
};

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
        recipient: { type: 'string', description: 'Email address of recipient' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body content' },
        cc: { type: 'string', description: 'CC recipients' },
      },
      required: ['recipient', 'subject', 'body'],
    },
    output_parameters: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: 'Unique message identifier' },
        status: { type: 'string', description: 'Delivery status' },
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
    name: 'Slack Upload',
    slug: 'SLACK_UPLOAD_OR_CREATE_A_FILE_IN_SLACK',
    description: 'Uploads a file to Slack',
    tags: ['files', 'slack'],
    available_versions: ['20260101_00'],
    input_parameters: {
      type: 'object',
      properties: {
        channels: { type: 'string', description: 'Slack channel ID' },
        file: {
          type: 'object',
          file_uploadable: true,
          title: 'File',
          description: 'Local file accepted by CLI',
          properties: {
            name: { type: 'string' },
            mimetype: { type: 'string' },
            s3key: { type: 'string' },
          },
          required: ['name', 'mimetype', 's3key'],
        },
      },
    },
    output_parameters: { type: 'object', properties: {} },
  },
];

const toolkitsData = {
  tools: testTools,
} satisfies TestLiveInput['toolkitsData'];

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_USER_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

describe('CLI: composio tools info', () => {
  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] valid slug [Then] displays tool info',
    it => {
      it.scoped('shows brief tool details and cached schema path', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'info', 'GMAIL_SEND_EMAIL']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Send Email');
          expect(output).toContain('GMAIL_SEND_EMAIL');
          expect(output).toContain('Schema Cache');
          expect(output).toContain('/tool_definitions/GMAIL_SEND_EMAIL.json');
          expect(output).toContain(
            "jq '{required: (.inputSchema.required // []), keys: (.inputSchema.properties | keys)}'"
          );
          expect(output).toContain('composio execute "GMAIL_SEND_EMAIL" -d');
          expect(output).toContain('--dry-run');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] file_uploadable tool info [Then] it shows the CLI-facing file schema',
    it => {
      it.scoped('renders file inputs as path strings in JSON output', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'info', 'SLACK_UPLOAD_OR_CREATE_A_FILE_IN_SLACK']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = parseLastJson(lines) as {
            inputSchema: Record<string, unknown>;
          };

          expect(output.inputSchema).toEqual({
            type: 'object',
            properties: {
              channels: { type: 'string', description: 'Slack channel ID' },
              file: {
                title: 'File',
                description: 'Local file accepted by CLI',
                format: 'path',
                type: 'string',
                file_uploadable: true,
              },
            },
          });
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] no slug [Then] warns missing argument',
    it => {
      it.scoped('shows missing argument warning', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'info']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('Missing required argument');
        })
      );
    }
  );

  layer(TestLive({ baseConfigProvider: testConfigProvider, toolkitsData }))(
    '[Given] invalid slug [Then] shows error and suggestions',
    it => {
      it.scoped('shows not found with suggestions', () =>
        Effect.gen(function* () {
          yield* cli(['tools', 'info', 'NONEXISTENT_TOOL']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = lines.join('\n');

          expect(output).toContain('not found');
        })
      );
    }
  );

  layer(TestLive())('[Given] no API key [Then] warns user to login', it => {
    it.scoped('warns user to login', () =>
      Effect.gen(function* () {
        yield* cli(['tools', 'info', 'GMAIL_SEND_EMAIL']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('not logged in');
      })
    );
  });
});
