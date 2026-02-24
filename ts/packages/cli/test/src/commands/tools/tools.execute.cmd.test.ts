import { describe, expect, layer } from '@effect/vitest';
import { vi, beforeEach, afterEach } from 'vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { ComposioToolExecutionError } from '@composio/core';
import { ActionExecuteConnectedAccountNotFoundError } from 'src/services/tools-executor';
import * as redactModule from 'src/ui/redact';
import { cli, TestLive, MockConsole } from 'test/__utils__';

const testConfigProvider = ConfigProvider.fromMap(
  new Map([['COMPOSIO_API_KEY', 'test_api_key']])
).pipe(extendConfigProvider);

const parseLastJson = (lines: ReadonlyArray<string>) => {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line) continue;
    try {
      return JSON.parse(line) as {
        data: { slug: string; params: Record<string, unknown> };
      };
    } catch {
      // keep searching for the last JSON line
    }
  }
  throw new Error('Expected JSON output but none found');
};

describe('CLI: composio tools execute', () => {
  // Disable CI redaction so tests see raw values.
  // The explicit CI-redaction test overrides via vi.spyOn and is unaffected.
  let savedCI: string | undefined;
  beforeEach(() => {
    savedCI = process.env.CI;
    delete process.env.CI;
  });
  afterEach(() => {
    if (savedCI !== undefined) process.env.CI = savedCI;
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] -d inline JSON [Then] executes with defaults', it => {
    it.scoped('executes with defaults', () =>
      Effect.gen(function* () {
        yield* cli(['tools', 'execute', 'GMAIL_SEND_EMAIL', '-d', '{"recipient":"a"}']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines);
        const params = output.data.params as Record<string, unknown>;

        expect(output.data.slug).toBe('GMAIL_SEND_EMAIL');
        expect(params.userId).toBe('default');
        expect(params.arguments).toEqual({ recipient: 'a' });
        expect(params.dangerouslySkipVersionCheck).toBe(true);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: false, data: '{"owner":"composio"}' },
    })
  )('[Given] stdin is piped [Then] reads input from stdin', it => {
    it.scoped('reads stdin input', () =>
      Effect.gen(function* () {
        yield* cli(['tools', 'execute', 'GITHUB_GET_REPOS']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines);
        const params = output.data.params as Record<string, unknown>;

        expect(params.arguments).toEqual({ owner: 'composio' });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        failWith: new ActionExecuteConnectedAccountNotFoundError({
          slug: 'ActionExecute_ConnectedAccountNotFound',
          message: 'No connected account found for entity ID default for toolkit gmail',
        }),
      },
    })
  )('[Given] connected account not found slug [Then] prints tips', it => {
    it.scoped('prints connected account tips', () =>
      Effect.gen(function* () {
        yield* cli([
          'tools',
          'execute',
          'GMAIL_CREATE_EMAIL_DRAFT',
          '-d',
          '{\"recipient\":\"to@example.com\"}',
        ]).pipe(Effect.catchAll(() => Effect.void));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('No connected account found');
        expect(output).toContain('Tips');
        expect(output).toContain('composio connected-accounts link');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] --version override [Then] passes version and no auto-skip', it => {
    it.scoped('passes version and no auto-skip', () =>
      Effect.gen(function* () {
        yield* cli([
          'tools',
          'execute',
          'GITHUB_GET_REPOS',
          '-d',
          '{"owner":"composio"}',
          '--user-id',
          'user_123',
          '--toolkit-version',
          '20250909_00',
        ]);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines);
        const params = output.data.params as Record<string, unknown>;

        expect(params.userId).toBe('user_123');
        expect(params.version).toBe('20250909_00');
        expect('dangerouslySkipVersionCheck' in params).toBe(false);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        failWith: {
          error: new ComposioToolExecutionError(
            'Error executing the tool GMAIL_CREATE_EMAIL_DRAFT',
            {
              possibleFixes: ['Ensure the tool slug is correct'],
            }
          ),
        },
      },
    })
  )('[Given] executor throws wrapped error [Then] prints actionable message', it => {
    it.scoped('prints actionable error details', () =>
      Effect.gen(function* () {
        yield* cli([
          'tools',
          'execute',
          'GMAIL_CREATE_EMAIL_DRAFT',
          '-d',
          '{\"recipient\":\"to@example.com\"}',
        ]).pipe(Effect.catchAll(() => Effect.void));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('Error executing the tool GMAIL_CREATE_EMAIL_DRAFT');
        expect(output).toContain('Possible fixes');
        expect(output).toContain('Ensure the tool slug is correct');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        failWith: { error: { message: 'API error: invalid input' } },
      },
    })
  )('[Given] executor throws object error [Then] prints message and details', it => {
    it.scoped('prints object error message and details', () =>
      Effect.gen(function* () {
        yield* cli([
          'tools',
          'execute',
          'GMAIL_CREATE_EMAIL_DRAFT',
          '-d',
          '{\"recipient\":\"to@example.com\"}',
        ]).pipe(Effect.catchAll(() => Effect.void));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        expect(output).toContain('API error: invalid input');
        expect(output).toContain('Error details');
      })
    );
  });

  // --- Soft failure tests (API returns { successful: false }) ---

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        respondWith: {
          data: {},
          error:
            "Invalid request data provided\n- Following fields are missing: {'recipient_email'}",
          successful: false,
          logId: 'log_test123',
        },
      },
    })
  )('[Given] tool returns soft failure with logId [Then] shows error and logId', it => {
    it.scoped('shows error and logId for soft failure', () =>
      Effect.gen(function* () {
        yield* cli([
          'tools',
          'execute',
          'GMAIL_CREATE_EMAIL_DRAFT',
          '-d',
          '{\"recipient\":\"to@example.com\"}',
        ]).pipe(Effect.catchAll(() => Effect.void));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        // Spinner should error, not succeed — no success message for the spinner
        expect(output).not.toContain('Executing tool');
        // Error message and logId should appear
        expect(output).toContain('Execution failed');
        expect(output).toContain('log_test123');
        expect(output).toContain('Invalid request data provided');
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        respondWith: {
          data: {},
          error: 'Tool execution failed',
          successful: false,
        },
      },
    })
  )('[Given] tool returns soft failure without logId [Then] shows error without logId', it => {
    it.scoped('shows error without logId for soft failure', () =>
      Effect.gen(function* () {
        yield* cli([
          'tools',
          'execute',
          'GMAIL_CREATE_EMAIL_DRAFT',
          '-d',
          '{\"recipient\":\"to@example.com\"}',
        ]).pipe(Effect.catchAll(() => Effect.void));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = lines.join('\n');

        // Spinner should error, not succeed
        expect(output).not.toContain('Executing tool');
        expect(output).toContain('Execution failed');
        expect(output).toContain('Tool execution failed');
        expect(output).not.toContain('logId');
      })
    );
  });

  // --- Edge case tests ---

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] -d with invalid JSON [Then] fails with parse error', it => {
    it.scoped('fails with invalid JSON error', () =>
      Effect.gen(function* () {
        const result = yield* cli([
          'tools',
          'execute',
          'GMAIL_SEND_EMAIL',
          '-d',
          'not-valid-json',
        ]).pipe(Effect.catchAll(e => Effect.succeed(e)));

        expect(result).toBeDefined();
        expect(result instanceof Error ? result.message : String(result)).toContain(
          'Invalid JSON input'
        );
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] -d with JSON array [Then] fails with expected-object error', it => {
    it.scoped('fails with expected object error', () =>
      Effect.gen(function* () {
        const result = yield* cli(['tools', 'execute', 'GMAIL_SEND_EMAIL', '-d', '[1,2,3]']).pipe(
          Effect.catchAll(e => Effect.succeed(e))
        );

        expect(result).toBeDefined();
        expect(result instanceof Error ? result.message : String(result)).toContain(
          'Expected a JSON object'
        );
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] -d with JSON string [Then] fails with expected-object error', it => {
    it.scoped('fails with expected object error for string', () =>
      Effect.gen(function* () {
        const result = yield* cli([
          'tools',
          'execute',
          'GMAIL_SEND_EMAIL',
          '-d',
          '"just a string"',
        ]).pipe(Effect.catchAll(e => Effect.succeed(e)));

        expect(result).toBeDefined();
        expect(result instanceof Error ? result.message : String(result)).toContain(
          'Expected a JSON object'
        );
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] no -d and TTY stdin [Then] fails with missing input error', it => {
    it.scoped('fails with missing input error', () =>
      Effect.gen(function* () {
        const result = yield* cli(['tools', 'execute', 'GMAIL_SEND_EMAIL']).pipe(
          Effect.catchAll(e => Effect.succeed(e))
        );

        expect(result).toBeDefined();
        expect(result instanceof Error ? result.message : String(result)).toContain(
          'Missing JSON input'
        );
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: false, data: '' },
    })
  )('[Given] empty piped stdin [Then] fails with parse error', it => {
    it.scoped('fails with error for empty stdin', () =>
      Effect.gen(function* () {
        const result = yield* cli(['tools', 'execute', 'GMAIL_SEND_EMAIL']).pipe(
          Effect.catchAll(e => Effect.succeed(e))
        );

        expect(result).toBeDefined();
        expect(result instanceof Error ? result.message : String(result)).toContain(
          'Invalid JSON input'
        );
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] --toolkit-version latest [Then] sets dangerouslySkipVersionCheck', it => {
    it.scoped('skips version check for "latest"', () =>
      Effect.gen(function* () {
        yield* cli([
          'tools',
          'execute',
          'GITHUB_GET_REPOS',
          '-d',
          '{"owner":"composio"}',
          '--toolkit-version',
          'latest',
        ]);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines);
        const params = output.data.params as Record<string, unknown>;

        expect(params.version).toBe('latest');
        expect(params.dangerouslySkipVersionCheck).toBe(true);
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
    })
  )('[Given] --connected-account-id [Then] passes it through', it => {
    it.scoped('forwards connected account id', () =>
      Effect.gen(function* () {
        yield* cli([
          'tools',
          'execute',
          'GMAIL_SEND_EMAIL',
          '-d',
          '{"recipient":"a"}',
          '--connected-account-id',
          'con_abc123',
        ]);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines);
        const params = output.data.params as Record<string, unknown>;

        expect(params.connectedAccountId).toBe('con_abc123');
      })
    );
  });

  // --- CI redaction tests ---

  layer(
    TestLive({
      baseConfigProvider: testConfigProvider,
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        respondWith: {
          data: {
            id: '19c8ab00a2e35870',
            labelIds: ['SENT'],
            threadId: '19c8ab00a2e35870',
          },
          error: null,
          successful: true,
          logId: 'log_uDPw0g_w8QCa',
        },
      },
    })
  )('[Given] CI redaction enabled [Then] redacts id-like fields and logId', it => {
    it.scoped('redacts id, threadId, logId but preserves labelIds', () =>
      Effect.gen(function* () {
        const spy = vi
          .spyOn(redactModule, 'redact')
          .mockImplementation(
            (({ prefix }: { value: string; prefix?: string }) =>
              `${prefix ?? ''}<REDACTED>`) as typeof redactModule.redact
          );

        try {
          yield* cli([
            'tools',
            'execute',
            'GMAIL_SEND_EMAIL',
            '-d',
            '{"recipient_email":"to@example.com"}',
          ]);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = parseLastJson(lines) as unknown as {
            data: { id: string; labelIds: string[]; threadId: string };
            logId: string;
            successful: boolean;
          };

          expect(output.data.id).toBe('<REDACTED>');
          expect(output.data.threadId).toBe('<REDACTED>');
          expect(output.data.labelIds).toEqual(['SENT']);
          expect(output.logId).toBe('log_<REDACTED>');
          expect(output.successful).toBe(true);
        } finally {
          spy.mockRestore();
        }
      })
    );
  });
});
