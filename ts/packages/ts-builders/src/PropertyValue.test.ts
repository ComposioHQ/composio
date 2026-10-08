import { expect, test } from 'vitest';

import { objectValue } from './ObjectValue';
import { propertyValue } from './PropertyValue';
import { stringify } from './stringify';
import { stringLiteral } from './StringLiteralType';
import { toStringTag } from './WellKnownSymbol';

test('name and value', () => {
  const prop = propertyValue('SEND', stringLiteral('SLACK_SEND').asValue());

  expect(stringify(prop)).toMatchInlineSnapshot(`"SEND: "SLACK_SEND""`);
});

test('well-known symbol', () => {
  const prop = propertyValue(toStringTag, stringLiteral('x').asValue());

  expect(stringify(prop)).toMatchInlineSnapshot(`"[Symbol.toStringTag]: "x""`);
});

test('optional', () => {
  const prop = propertyValue('SEND', stringLiteral('x').asValue()).optional();

  expect(stringify(prop)).toMatchInlineSnapshot(`"SEND?: "x""`);
});

// A slug reaches this builder as an object-literal key. Written verbatim it can
// close the key and inject code that runs when the generated SDK is imported.
// Non-identifier names must become quoted computed keys, as Property already does.
test('a crafted slug cannot break out of the key position', () => {
  const malicious = '["k"]: (() => { globalThis.__PWNED__ = 1; })(), ["SEND"]';

  const out = stringify(propertyValue(malicious, stringLiteral('SLACK_SEND').asValue()));

  expect(out).toBe(`[${JSON.stringify(malicious)}]: "SLACK_SEND"`);

  // The payload text survives inside the quoted key; what matters is that
  // evaluating the generated literal does not execute it.
  const evaluated = new Function(`return { ${out} };`)() as Record<string, unknown>;
  expect(Object.keys(evaluated)).toEqual([malicious]);
  expect((globalThis as Record<string, unknown>).__PWNED__).toBeUndefined();
});

test('injected slug stays inert inside a generated object literal', () => {
  const malicious = 'a": 1, "__proto__';

  const out = stringify(
    objectValue()
      .add(propertyValue(malicious, stringLiteral('v').asValue()))
      .formatInline()
  );

  expect(out).toBe(`{ [${JSON.stringify(malicious)}]: "v" }`);
});

test('a slug that is not a valid identifier is quoted, not dropped', () => {
  const out = stringify(propertyValue('123FOO', stringLiteral('T_123FOO').asValue()));

  expect(out).toBe('["123FOO"]: "T_123FOO"');
});
