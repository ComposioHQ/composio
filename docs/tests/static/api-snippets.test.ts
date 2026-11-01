import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { checkApiSnippets, loadApiSpecs, parseApiSpec, parseCurlCommands, wordText, type ApiSpecs } from '../../lib/api-snippets';
import { listCodeExampleFiles } from '../../lib/code-examples';

const BASE = 'https://backend.composio.dev/api/v3.1';
const KEY = '-H "x-api-key: $COMPOSIO_API_KEY"';
const SCHEMES = {
  ApiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
  UserKey: { type: 'apiKey', in: 'header', name: 'x-user-api-key' },
  Bearer: { type: 'http', scheme: 'bearer' },
};
const AUTH = [{ ApiKey: [] }];
const json = (schema: unknown, required?: boolean) => ({ required, content: { 'application/json': { schema } } });
const EXECUTE = {
  type: 'object', additionalProperties: false, required: ['arguments'],
  properties: { arguments: { type: 'object' }, user_id: { type: 'string' } },
};
const SPECS: ApiSpecs = {
  v3_1: parseApiSpec('openapi.json', {
    paths: {
      '/api/v3.1/tools': { get: { security: AUTH } },
      '/api/v3.1/tools/execute/{tool_slug}': { post: { security: [{ ApiKey: [] }, { UserKey: [] }], requestBody: json(EXECUTE) } },
      '/api/v3.1/things/search': { get: { security: AUTH } },
      '/api/v3.1/things/{id}': { post: { security: AUTH } },
      '/api/v3.1/health': { get: { security: [{}] } },
      '/api/v3.1/unknown-security': { get: { security: [{ UndefinedScheme: [] }] } },
      '/api/v3.1/mixed-security': { get: { security: [{ UndefinedScheme: [] }, { ApiKey: [] }] } },
      '/api/v3.1/bearer': { get: { security: [{ Bearer: [] }] } },
      '/api/v3.1/combined-security': { get: { security: [{ ApiKey: [], UserKey: [] }] } },
      '/api/v3.1/nullable-gap/{id}': { patch: { security: AUTH, requestBody: json({
        type: 'object', additionalProperties: false,
        properties: { settings: { type: 'object', properties: { callback_url: { type: 'string' }, enabled: { type: 'boolean' } } } },
      }) } },
    },
    components: { securitySchemes: SCHEMES },
  }),
  v3: parseApiSpec('openapi-v3.json', {
    paths: { '/api/v3/tools': { get: { security: AUTH } } },
    components: { securitySchemes: SCHEMES },
  }),
};
const fence = (...lines: string[]) => ['```bash', ...lines, '```'].join('\n');
const check = (source: string, specs = SPECS, path = 'content/docs/page.mdx') => checkApiSnippets([{ path, source }], specs);
const rules = (source: string, specs = SPECS, path?: string) => check(source, specs, path).map(({ rule }) => rule);
const exception = (rule: string, operation: string, field?: string) =>
  `{/* code-example: unchecked-api rule="${rule}" operation="${operation}"${field === undefined ? '' : ` field="${field}"`} reason="Published schema differs from the documented endpoint" */}`;
const schemaSpecs = (schema: unknown, required?: boolean): ApiSpecs => {
  const spec = parseApiSpec('schema-fixture', {
    paths: { '/api/v3.1/check': { post: { security: AUTH, requestBody: json(schema, required) } } },
    components: { securitySchemes: SCHEMES, schemas: {
      X: { type: 'object', properties: { a: { type: 'string' } } },
      Tree: { type: 'object', properties: { label: { type: 'string' }, child: { $ref: '#/components/schemas/Tree' } } },
      Bounded: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 10, exclusiveMaximum: true },
    } },
  });
  return { v3_1: spec, v3: spec };
};
const bodyCheck = (schema: unknown, value: unknown) => check(
  fence(`curl ${BASE}/check ${KEY} --json='${JSON.stringify(value)}'`), schemaSpecs(schema),
);

describe('curl request behavior', () => {
  test('equals-form headers, method, URL, and JSON are actually checked', () => {
    expect(rules(fence(`curl --url=${BASE}/tools --header="x-api-key: $COMPOSIO_API_KEY"`))).toEqual([]);
    expect(rules(fence(`curl ${BASE}/tools ${KEY} --request=DELETE`))).toEqual(['api-unknown-operation']);
    expect(rules(fence(`curl --url=${BASE}/tools/execute/X ${KEY} --json='{"wrong":true}'`))).toEqual(['api-body-schema', 'api-body-schema']);
    expect(rules(fence(`curl ${BASE}/tools/execute/X ${KEY} --json=`))).toEqual(['api-json-invalid']);
  });

  test('every positional/--url transfer is checked, including a later invalid URL', () => {
    expect(check(fence(`curl ${BASE}/tools --url=${BASE}/missing ${KEY}`)).map(({ rule, message }) => [rule, message])).toEqual([
      ['api-unknown-operation', 'GET /api/v3.1/missing is not an operation in openapi.json'],
    ]);
    expect(rules(fence(`curl https://example.com ${BASE}/missing ${KEY}`))).toEqual(['api-unknown-operation']);
  });

  test('--next resets method, headers, and data instead of leaking them across transfers', () => {
    const source = fence(`curl ${BASE}/tools/execute/X ${KEY} --json='{"arguments":{}}' --next ${BASE}/tools`);
    expect(rules(source)).toEqual(['api-key-header']);
    expect(parseCurlCommands(source.slice(8, -4)).map(({ method, urls, headers, data }) => ({
      method, urls: urls.map(wordText), headers: headers.length, data: data.length,
    }))).toEqual([
      { method: 'POST', urls: [`${BASE}/tools/execute/X`], headers: 1, data: 1 },
      { method: 'GET', urls: [`${BASE}/tools`], headers: 0, data: 0 },
    ]);
  });

  test('upload-file infers PUT and diagnoses its uncheckable body', () => {
    for (const upload of ['-T payload.json', '--upload-file=payload.json']) {
      const result = check(fence(`curl ${BASE}/tools ${KEY} ${upload}`));
      expect(result.some(({ rule, message }) => rule === 'api-unknown-operation' && message.startsWith('PUT '))).toBe(true);
      expect(result.some(({ rule }) => rule === 'api-body-unchecked')).toBe(true);
    }
  });

  test('validates commands inside substitutions and respects quote and continuation semantics', () => {
    const source = fence(
      `ID=$(curl -s ${BASE}/missing ${KEY} | jq -r '.id')`,
      'echo "$(curl ' + BASE + '/tools ' + KEY + ')"',
      `curl -fsSL --compressed --max-time=30 --retry 2 ${BASE}/tools \\`,
      `  ${KEY} 2>&1 | jq .`,
    );
    expect(check(source).map(({ line, rule }) => `${line} ${rule}`)).toEqual(['2 api-unknown-operation']);
    expect(check(source.replaceAll('\n', '\r\n')).map(({ line, rule }) => `${line} ${rule}`)).toEqual(['2 api-unknown-operation']);
    expect(rules(fence(`curl ${BASE}/tools -H 'x-api-key: $COMPOSIO_API_KEY'`))).toEqual(['api-key-header']);
    expect(rules(fence(`curl ${BASE}/tools -H "x-api-key: \\$COMPOSIO_API_KEY"`))).toEqual(['api-key-header']);
    expect(rules(fence(`curl ${BASE}/tools -H "x-api-key: \${COMPOSIO_API_KEY}"`))).toEqual([]);
    expect(rules(fence(`echo "\`curl ${BASE}/missing ${KEY}\`"`))).toEqual(['api-unknown-operation']);
  });

  test('does not silently accept unknown flags, configs, expanded headers, or malformed shell', () => {
    for (const options of ['--expand-json=@payload', '--request-target=/hidden', '--config=secrets.cfg', '--header=@headers', '--mystery']) {
      expect(rules(fence(`curl ${BASE}/tools ${KEY} ${options}`))).toContain('api-curl-unsupported');
    }
    expect(rules(fence(`curl ${BASE}/tools ${KEY} -H "unterminated`))).toContain('api-curl-unsupported');
  });

  test('form, file, URL-encoded, and fully expanded bodies cannot silently pass', () => {
    for (const data of ["-F wrong=1", '--form-string=wrong=1', '--data=@payload.json', '--json=@payload.json', '--data-urlencode=wrong=1', '-d "$PAYLOAD"']) {
      expect(rules(fence(`curl ${BASE}/tools/execute/X ${KEY} ${data}`))).toContain('api-body-unchecked');
    }
    expect(rules(fence(`curl ${BASE}/tools/execute/X ${KEY} --data-raw=@payload.json`))).toEqual(['api-json-invalid']);
  });

  test('literal path precedence is resolved before HTTP method selection', () => {
    expect(check(fence(`curl -X POST ${BASE}/things/search ${KEY}`)).map(({ rule, message }) => [rule, message])).toEqual([
      ['api-unknown-operation', 'POST /api/v3.1/things/search is not an operation in openapi.json; the path allows GET'],
    ]);
    expect(rules(fence(`curl -X POST ${BASE}/things/thing_1 ${KEY}`))).toEqual([]);
  });

  test('non-API transfers and non-shell fences are not mistaken for Composio calls', () => {
    expect(rules(fence('curl -fsSL https://composio.dev/install | sh', 'curl http://localhost:8000/x'))).toEqual([]);
    expect(rules(['```python', `# curl ${BASE}/missing`, '```'].join('\n'))).toEqual([]);
  });

  test('recognizes self-hosted Thermos variables rather than silently ignoring health requests', () => {
    for (const base of ['$THERMOS_BASE_URL', '${THERMOS_BASE_URL}']) {
      expect(rules(fence(`curl "${base}/api/health/deep"`))).toEqual([
        'api-base-url', 'api-key-header', 'api-legacy-version',
      ]);
    }
  });
});

describe('OpenAPI authentication', () => {
  test('accepts any fully valid security alternative, not just the first present header', () => {
    expect(rules(fence(`curl ${BASE}/tools/execute/X -H "x-api-key: literal" -H "x-user-api-key: $COMPOSIO_USER_API_KEY" --json='{"arguments":{}}'`))).toEqual([]);
    expect(rules(fence(`curl ${BASE}/mixed-security ${KEY}`))).toEqual([]);
    expect(rules(fence(`curl ${BASE}/combined-security ${KEY}`))).toEqual(['api-key-header']);
  });

  test('unknown schemes are not public, while an explicit empty requirement is public', () => {
    expect(rules(fence(`curl ${BASE}/unknown-security`))).toEqual(['api-key-header']);
    expect(rules(fence(`curl ${BASE}/health`))).toEqual([]);
    expect(rules(fence(`curl ${BASE}/bearer -H "authorization: Bearer $TOKEN"`))).toEqual([]);
    expect(rules(fence(`curl ${BASE}/bearer --oauth2-bearer="$TOKEN"`))).toEqual([]);
    expect(rules(fence(`curl ${BASE}/bearer -H 'authorization: Bearer $TOKEN'`))).toEqual(['api-key-header']);
  });
});

describe('OpenAPI JSON schema semantics', () => {
  test('oneOf means exactly one matching branch, while anyOf permits overlap', () => {
    expect(bodyCheck({ oneOf: [{ type: 'number' }, { type: 'integer' }] }, 1).some(({ message }) => message.includes('(oneOf)'))).toBe(true);
    expect(bodyCheck({ anyOf: [{ type: 'number' }, { type: 'integer' }] }, 1)).toEqual([]);
    expect(bodyCheck({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, true).some(({ message }) => message.includes('(anyOf)'))).toBe(true);
  });

  test('allOf does not merge closed object properties across branches', () => {
    const schema = { allOf: [
      { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false },
      { type: 'object', properties: { b: { type: 'string' } } },
    ] };
    expect(bodyCheck(schema, { a: 'x', b: 'y' }).some(({ message }) => message.includes('"b"') && message.includes('(additionalProperties)'))).toBe(true);
  });

  test('boolean schemas, nullable, enum null, typed additionalProperties, and refs follow Ajv', () => {
    expect(bodyCheck(false, {}).map(({ rule }) => rule)).toEqual(['api-body-schema']);
    expect(bodyCheck({ type: 'string', nullable: true }, null)).toEqual([]);
    expect(bodyCheck({ enum: ['a', 'b'] }, null).map(({ rule }) => rule)).toEqual(['api-body-schema']);
    expect(bodyCheck({ type: 'string', nullable: true, enum: ['a'] }, null).map(({ rule }) => rule)).toEqual(['api-body-schema']);
    expect(bodyCheck({ type: 'object', additionalProperties: { type: 'integer' } }, { a: 'bad' }).map(({ rule }) => rule)).toEqual(['api-body-schema']);
    expect(bodyCheck({ $ref: '#/components/schemas/X' }, { a: 2 }).map(({ rule }) => rule)).toEqual(['api-body-schema']);
    expect(bodyCheck({ $ref: '#/components/schemas/Tree' }, { child: { label: 2 } }).map(({ rule }) => rule)).toEqual(['api-body-schema']);
  });

  test('normalizes OpenAPI 3.0 boolean exclusive bounds without weakening either boundary', () => {
    for (const [schema, rejected, accepted] of [
      [{ type: 'number', minimum: 0, exclusiveMinimum: true }, 0, 1],
      [{ type: 'number', minimum: 0, exclusiveMinimum: false }, -1, 0],
      [{ type: 'number', maximum: 10, exclusiveMaximum: true }, 10, 9],
      [{ type: 'number', maximum: 10, exclusiveMaximum: false }, 11, 10],
      [{ type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 10 }, 0, 5],
    ] as const) {
      expect(bodyCheck(schema, rejected).map(({ rule }) => rule)).toEqual(['api-body-schema']);
      expect(bodyCheck(schema, accepted)).toEqual([]);
    }
    for (const value of [0, 10]) {
      expect(bodyCheck({ $ref: '#/components/schemas/Bounded' }, value).map(({ rule }) => rule)).toEqual(['api-body-schema']);
    }
    expect(bodyCheck({ $ref: '#/components/schemas/Bounded' }, 5)).toEqual([]);
    const schema = { type: 'number', minimum: 0, exclusiveMinimum: true };
    expect(bodyCheck(schema, 1)).toEqual([]);
    expect(schema.exclusiveMinimum).toBe(true);
    expect(schema.minimum).toBe(0);
    const literal = { minimum: 0, exclusiveMinimum: true };
    expect(bodyCheck({ type: 'object', const: literal }, literal)).toEqual([]);
  });

  test('literal abbreviated base64 fails while real shell expansion skips only its unknown value', () => {
    const schema = {
      type: 'object',
      required: ['logo_file'],
      properties: {
        logo_file: {
          type: 'object', required: ['content', 'mime_type'],
          properties: {
            content: { type: 'string', pattern: '^[A-Za-z0-9+/]+={0,2}$' },
            mime_type: { enum: ['image/png', 'image/jpeg'] },
          },
        },
      },
    };
    for (const content of ['iVBORw0KGgoAAAANSUhEUgAA...', '${BASE64_CONTENT}']) {
      expect(bodyCheck(schema, { logo_file: { content, mime_type: 'image/png' } }).some(({ message }) => message.includes('(pattern)'))).toBe(true);
    }
    const code = `curl ${BASE}/check ${KEY} -d '{"logo_file":{"content":"'"$BASE64_CONTENT"'","mime_type":"image/png"}}'`;
    expect(rules(fence(code), schemaSpecs(schema))).toEqual([]);
    expect(rules(fence(code.replace('image/png', 'invalid/type')), schemaSpecs(schema))).toEqual(['api-body-schema']);
  });

  test('missing body still reports required fields when requestBody.required is absent', () => {
    expect(rules(fence(`curl -X POST ${BASE}/tools/execute/X ${KEY}`))).toEqual(['api-body-schema']);
    expect(rules(fence(`curl -X POST ${BASE}/check ${KEY}`), schemaSpecs({ type: 'object' }, true))).toEqual(['api-body-schema']);
    expect(rules(fence(`curl -X POST ${BASE}/check ${KEY}`), schemaSpecs({ type: 'object' }))).toEqual([]);
  });

  test('dynamic values preserve checks on literal surrounding structure and known string types', () => {
    const specs = schemaSpecs({
      type: 'object', required: ['count', 'required_literal'], additionalProperties: false,
      properties: { count: { type: 'number' }, required_literal: { type: 'integer' }, label: { type: 'string', enum: ['fixed'] } },
    });
    const valid = `curl ${BASE}/check ${KEY} -d "{\\\"count\\\": $COUNT, \\\"required_literal\\\": 1, \\\"label\\\": \\\"prefix_$LABEL\\\"}"`;
    expect(rules(fence(valid), specs)).toEqual([]);
    const invalid = `curl ${BASE}/check ${KEY} -d "{\\\"count\\\": $(date +%s), \\\"wrong\\\": true}"`;
    const result = check(fence(invalid), specs);
    expect(result.some(({ message }) => message.includes('required_literal'))).toBe(true);
    expect(result.some(({ message }) => message.includes('"wrong"'))).toBe(true);
    const quotedNumber = `curl ${BASE}/check ${KEY} -d "{\\\"count\\\": \\\"$COUNT\\\", \\\"required_literal\\\": 1}"`;
    expect(check(fence(quotedNumber), specs).some(({ message }) => message.includes('"count"') && message.includes('(type)'))).toBe(true);
  });

  test('JSON syntax is still checked when an operation forbids a body', () => {
    expect(rules(fence(`curl -X GET ${BASE}/tools ${KEY} -d '{bad}'`))).toEqual(['api-body-schema', 'api-json-invalid']);
    expect(rules(fence(`curl -G ${BASE}/tools ${KEY} --data-urlencode=toolkit_slug=gmail`))).toEqual([]);
  });
});

describe('scoped unchecked-api markers', () => {
  const patch = `curl -X PATCH ${BASE}/nullable-gap/$ID ${KEY} --json='{"settings":{"callback_url":null}}'`;
  const op = 'PATCH /api/v3.1/nullable-gap/{id}';


  test('stale checks follow request-shape constraints, not proof of runtime endpoint existence', () => {
    const code = fence(`curl -X POST ${BASE}/things/arbitrary ${KEY}`);
    expect(rules(code)).toEqual([]);
    expect(rules([exception('api-unknown-operation', 'POST /api/v3.1/things/arbitrary'), code].join('\n'))).toEqual(['api-exemption']);
  });
  test('a body-field gap exempts only that operation, rule, and exact field', () => {
    const marker = exception('api-body-schema', op, 'settings.callback_url');
    expect(rules([marker, fence(patch)].join('\n'))).toEqual([]);
    expect(rules([marker, fence(patch.replace('"callback_url":null', '"callback_url":null,"enabled":"yes"'))].join('\n'))).toEqual(['api-body-schema']);
    const source = [marker, fence(patch.replace('https:', 'http:').replace(KEY, ''), `curl ${BASE}/missing ${KEY}`)].join('\n');
    expect(rules(source)).toEqual(['api-base-url', 'api-key-header', 'api-unknown-operation']);
  });

  test('stale, unmatched, old blanket, and wrong-method markers fail', () => {
    expect(rules([exception('api-body-schema', op, 'settings.callback_url'), fence(patch.replace('"callback_url":null', '"callback_url":"https://example.com"'))].join('\n'))).toEqual(['api-exemption']);
    expect(rules([exception('api-body-schema', op.replace('PATCH', 'POST'), 'settings.callback_url'), fence(patch)].join('\n'))).toEqual(['api-exemption', 'api-body-schema']);
    expect(rules(['{/* code-example: unchecked-api reason="old blanket" */}', fence(`curl ${BASE}/tools ${KEY}`)].join('\n'))).toEqual(['api-exemption']);
  });

  test('unknown route exceptions retain origin, authentication, and JSON syntax checks', () => {
    const marker = exception('api-unknown-operation', 'POST /api/v3.1/internal');
    expect(rules([marker, fence(`curl -X POST ${BASE}/internal ${KEY} --json='{}'`)].join('\n'))).toEqual([]);
    expect(rules([marker, fence(`curl -X POST ${BASE.replace('https:', 'http:')}/internal --json='{bad}'`)].join('\n'))).toEqual(['api-base-url', 'api-json-invalid', 'api-key-header']);
  });

  test('version-policy exceptions retain every other check on legacy examples', () => {
    const marker = exception('api-legacy-version', 'GET /api/v3/tools');
    expect(rules([marker, fence(`curl https://backend.composio.dev/api/v3/tools ${KEY}`)].join('\n'))).toEqual([]);
    expect(rules([marker, fence('curl http://backend.composio.dev/api/v3/tools')].join('\n'))).toEqual(['api-base-url', 'api-key-header']);
    expect(rules(fence(`curl https://backend.composio.dev/api/v3/tools ${KEY}`), SPECS, 'content/reference/v3/authentication.mdx')).toEqual([]);
    expect(rules(fence('curl http://backend.composio.dev/api/v2/anything --json="{bad}"'))).toEqual(['api-base-url', 'api-json-invalid', 'api-key-header', 'api-legacy-version']);
  });
});

describe('authored API example inventory', () => {
  test('all inventory sources match published operations or exact documented exceptions', () => {
    const docsRoot = join(import.meta.dir, '../..');
    expect(checkApiSnippets(listCodeExampleFiles(docsRoot), loadApiSpecs(docsRoot))).toEqual([]);
  });
});
