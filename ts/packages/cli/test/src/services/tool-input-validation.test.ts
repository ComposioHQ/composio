import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@effect/vitest';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { ConfigProvider, Effect, Layer } from 'effect';
import * as tempy from 'tempy';
import {
  getCachedToolInputDefinition,
  ToolInputValidationError,
  validateToolInputArgumentsWithDefinition,
} from 'src/services/tool-input-validation';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { loadObjectCases } from '../../fixtures/corpus';

const definition = {
  schemaPath: '/tmp/GMAIL_SEND_EMAIL.json',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['recipient_email'],
    properties: {
      recipient_email: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
    },
  },
} as const;

describe('tool input validation', () => {
  it.effect('validates tool input through Effect Schema', () =>
    Effect.gen(function* () {
      const result = yield* validateToolInputArgumentsWithDefinition(
        'GMAIL_SEND_EMAIL',
        { recipient_email: 'karan@composio.dev', subject: 'Hello' },
        definition
      );

      expect(result).toEqual(definition);
    })
  );

  it.effect('suggests a schema key using the CLI autocorrect distance', () =>
    Effect.gen(function* () {
      const error = yield* validateToolInputArgumentsWithDefinition(
        'GMAIL_SEND_EMAIL',
        { recipent_email: 'karan@composio.dev' },
        definition
      ).pipe(Effect.flip);

      expect(error).toBeInstanceOf(ToolInputValidationError);
      expect(error.issues).toContain(
        '<root>: Unknown key "recipent_email". Use "recipient_email" instead. Allowed top-level keys: recipient_email, subject, body'
      );
    })
  );

  it.effect('keeps prefix-based suggestions without guessing unrelated keys', () =>
    Effect.gen(function* () {
      const prefixError = yield* validateToolInputArgumentsWithDefinition(
        'GMAIL_SEND_EMAIL',
        { recipient: 'karan@composio.dev' },
        definition
      ).pipe(Effect.flip);
      const unrelatedError = yield* validateToolInputArgumentsWithDefinition(
        'GMAIL_SEND_EMAIL',
        { account: 'karan@composio.dev' },
        definition
      ).pipe(Effect.flip);

      expect(prefixError.issues).toContain(
        '<root>: Unknown key "recipient". Use "recipient_email" instead. Allowed top-level keys: recipient_email, subject, body'
      );
      expect(unrelatedError.issues).toContain(
        '<root>: Unknown key "account". Allowed top-level keys: recipient_email, subject, body'
      );
    })
  );

  it.effect(
    'keeps length-aware typo suggestions without letting containment bypass the limit',
    () =>
      Effect.gen(function* () {
        const longTypoError = yield* validateToolInputArgumentsWithDefinition(
          'GMAIL_SEND_EMAIL',
          { recpnt_email: 'karan@composio.dev' },
          definition
        ).pipe(Effect.flip);
        const containmentError = yield* validateToolInputArgumentsWithDefinition(
          'TEST_TOOL',
          { to: true },
          {
            schemaPath: '/tmp/TEST_TOOL.json',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { auto_reply: { type: 'boolean' } },
            },
          }
        ).pipe(Effect.flip);

        expect(longTypoError.issues).toContain(
          '<root>: Unknown key "recpnt_email". Use "recipient_email" instead. Allowed top-level keys: recipient_email, subject, body'
        );
        expect(containmentError.issues).toContain(
          '<root>: Unknown key "to". Allowed top-level keys: auto_reply'
        );
      })
  );

  it.effect('reads legacy bare-schema cache entries through the Effect decoder', () => {
    const cacheDir = tempy.temporaryDirectory();
    const schemaPath = path.join(cacheDir, 'tool_definitions', 'GMAIL_SEND_EMAIL.json');
    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
    fs.writeFileSync(schemaPath, JSON.stringify(definition.schema));

    return Effect.gen(function* () {
      const cached = yield* getCachedToolInputDefinition('GMAIL_SEND_EMAIL');

      expect(cached).toEqual({
        schemaPath,
        schema: definition.schema,
        version: null,
      });
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          BunFileSystem.layer,
          BunPath.layer,
          Layer.succeed(NodeOs, defaultNodeOs({ homedir: cacheDir }))
        )
      ),
      Effect.withConfigProvider(
        ConfigProvider.fromMap(new Map([['CACHE_DIR', cacheDir]] satisfies Array<[string, string]>))
      )
    );
  });

  it.effect('preserves field paths in validation errors', () =>
    Effect.gen(function* () {
      const error = yield* validateToolInputArgumentsWithDefinition(
        'GMAIL_SEND_EMAIL',
        { recipient_email: 42 },
        definition
      ).pipe(Effect.flip);

      expect(error.issues.some(issue => issue.startsWith('recipient_email:'))).toBe(true);
    })
  );

  it.effect('preserves all field and unknown-key failures in one validation pass', () =>
    Effect.gen(function* () {
      const error = yield* validateToolInputArgumentsWithDefinition(
        'GMAIL_SEND_EMAIL',
        { recipient_email: 42, subject: false, recipent_email: 'karan@composio.dev' },
        definition
      ).pipe(Effect.flip);

      expect(error.issues.some(issue => issue.startsWith('recipient_email:'))).toBe(true);
      expect(error.issues.some(issue => issue.startsWith('subject:'))).toBe(true);
      expect(error.issues).toContain(
        '<root>: Unknown key "recipent_email". Use "recipient_email" instead. Allowed top-level keys: recipient_email, subject, body'
      );
    })
  );
});

describe('free-form object tool inputs', () => {
  const freeFormCase = loadObjectCases().find(entry => entry.id === 'nested-free-form-object');
  if (!freeFormCase) {
    throw new Error('Corpus is missing the nested-free-form-object case');
  }

  const freeFormDefinition = {
    schemaPath: '/tmp/METABASE_POST_API_CARD.json',
    schema: freeFormCase.schema,
  } as const;

  it.effect('accepts arbitrary content inside a property-less object', () =>
    Effect.gen(function* () {
      const result = yield* validateToolInputArgumentsWithDefinition(
        'METABASE_POST_API_CARD',
        freeFormCase.instances[0].input,
        freeFormDefinition
      );

      expect(result).toEqual(freeFormDefinition);
    })
  );

  it.effect('still reports unknown keys for named-property schemas', () =>
    Effect.gen(function* () {
      const error = yield* validateToolInputArgumentsWithDefinition(
        'GMAIL_SEND_EMAIL',
        { recipient_email: 'karan@composio.dev', nope: 1 },
        definition
      ).pipe(Effect.flip);

      expect(error).toBeInstanceOf(ToolInputValidationError);
    })
  );
});
