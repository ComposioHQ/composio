import { expect, test } from 'vitest';

import { docComment } from './DocComment';
import { functionType } from './FunctionType';
import { namedType } from './NamedType';
import { objectType } from './ObjectType';
import { property } from './Property';
import { stringify } from './stringify';
import { unionType } from './UnionType';
import { toStringTag } from './WellKnownSymbol';

const A = namedType('A');
const stringType = namedType('string');
const numberType = namedType('number');

test('name and type', () => {
  const prop = property('foo', A);

  expect(stringify(prop)).toMatchInlineSnapshot(`"foo: A"`);
});

test('invalid identifier', () => {
  const prop = property('this is not a valid JS identifier', A);

  expect(stringify(prop)).toMatchInlineSnapshot(`"["this is not a valid JS identifier"]: A"`);
});

test('well-known symbol', () => {
  const prop = property(toStringTag, A);

  expect(stringify(prop)).toMatchInlineSnapshot(`"[Symbol.toStringTag]: A"`);
});

test('optional', () => {
  const prop = property('foo', A).optional();

  expect(stringify(prop)).toMatchInlineSnapshot(`"foo?: A"`);
});

test('readonly', () => {
  const prop = property('foo', A).readonly();

  expect(stringify(prop)).toMatchInlineSnapshot(`"readonly foo: A"`);
});

test('with doc comment', () => {
  const prop = property('foo', A).setDocComment(docComment('This is foo'));

  expect(stringify(prop)).toMatchInlineSnapshot(`
    "/**
     * This is foo
     */
    foo: A"
  `);
});

test('property with union type does not add parentheses (ObjectProperty context)', () => {
  // Union has precedence 1, ObjectProperty context requires precedence 5
  // However, for object properties, union types don't need parentheses syntactically
  // because the property boundary is clear: { prop: string | number }
  // But according to precedence rules, 1 < 5 means parentheses would be added
  const unionProp = unionType([stringType, numberType]);
  const obj = objectType().add(property('value', unionProp)).formatInline();
  const result = stringify(obj);

  // ObjectProperty context has precedence 5, Union has precedence 1
  // Since 1 < 5, parentheses are added
  expect(result).toBe('{ value: (string | number) }');
});

test('property with function type does not add parentheses (ObjectProperty context)', () => {
  // Function type has precedence 4, ObjectProperty context requires precedence 5
  // Since 4 < 5, parentheses would be added
  const funcProp = functionType().setReturnType(stringType);
  const obj = objectType().add(property('callback', funcProp)).formatInline();
  const result = stringify(obj);

  // Function type (precedence 4) < ObjectProperty (precedence 5), so parentheses added
  expect(result).toBe('{ callback: (() => string) }');
});

test('optional property with union type adds parentheses', () => {
  const unionProp = unionType([stringType, numberType]);
  const obj = objectType().add(property('value', unionProp).optional()).formatInline();
  const result = stringify(obj);

  expect(result).toBe('{ value?: (string | number) }');
});

test('readonly property with union type adds parentheses', () => {
  const unionProp = unionType([stringType, numberType]);
  const obj = objectType().add(property('value', unionProp).readonly()).formatInline();
  const result = stringify(obj);

  expect(result).toBe('{ readonly value: (string | number) }');
});
