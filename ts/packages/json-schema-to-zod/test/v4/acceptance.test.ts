import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import { jsonSchemaToZod as toV3 } from '../../src/index';
import { jsonSchemaToZod as toV4 } from '../../src/v4';
import type { JsonSchema } from '../../src/types';

const ajv = new Ajv({ strict: false });

describe('v4 acceptance matches v3 without rewriting the input', () => {
  it.each([
    { name: 'a uri with surrounding spaces', value: '  https://example.com/a b  ' },
    { name: 'a uri with a mixed-case host', value: 'https://Example.COM/Path?Q=1' },
    { name: 'a uri with a trailing newline', value: 'https://example.com/\n' },
  ])('keeps $name as given', ({ value }) => {
    const schema: JsonSchema = { type: 'string', format: 'uri' };
    const v3 = toV3(schema).safeParse(value);
    const v4 = toV4(schema).safeParse(value);
    expect(v4.success).toBe(v3.success);
    expect(v4.success && v4.data).toBe(v3.success && v3.data);
    expect(v4.success && v4.data).toBe(value);
  });

  it('accepts a uuid with a non-RFC variant, as v3 does', () => {
    const schema: JsonSchema = { type: 'string', format: 'uuid' };
    const value = '123e4567-e89b-12d3-c456-426614174000';
    expect(toV3(schema).safeParse(value).success).toBe(true);
    expect(toV4(schema).safeParse(value).success).toBe(true);
    expect(toV4(schema).safeParse('not-a-uuid').success).toBe(false);
  });

  it('accepts an integer above 2^53, as v3 and Ajv do', () => {
    const schema: JsonSchema = { type: 'integer' };
    const value = 2 ** 53 + 2;
    expect(ajv.compile(schema)(value)).toBe(true);
    expect(toV3(schema).safeParse(value).success).toBe(true);
    expect(toV4(schema).safeParse(value).success).toBe(true);
    expect(toV4(schema).safeParse(1.5).success).toBe(false);
    expect(toV4({ type: 'number', format: 'int64' }).safeParse(value).success).toBe(true);
    expect(toV4({ type: 'number', multipleOf: 1 }).safeParse(value).success).toBe(true);
  });

  it.each(['127.0.0.1', '::1', '2001:db8::ff00:42:8329'])('accepts ip %s', value => {
    expect(toV4({ type: 'string', format: 'ip' }).safeParse(value).success).toBe(true);
  });

  it('rejects a value that is neither an IPv4 nor an IPv6 address', () => {
    expect(toV4({ type: 'string', format: 'ip' }).safeParse('999.1.1.1').success).toBe(false);
  });
});
