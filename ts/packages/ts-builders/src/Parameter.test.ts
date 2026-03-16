import { expect, test } from 'vitest';

import { functionType } from './FunctionType';
import { namedType } from './NamedType';
import { parameter } from './Parameter';
import { stringify } from './stringify';
import { unionType } from './UnionType';

const A = namedType('A');
const stringType = namedType('string');
const numberType = namedType('number');

test('name and type', () => {
  const param = parameter('foo', A);

  expect(stringify(param)).toMatchInlineSnapshot(`"foo: A"`);
});

test('optional', () => {
  const param = parameter('foo', A).optional();

  expect(stringify(param)).toMatchInlineSnapshot(`"foo?: A"`);
});

test('parameter with union type adds parentheses in function context', () => {
  // Union has precedence 1, FunctionParameter context requires precedence 4
  // So parentheses should be added: (param: (string | number))
  const unionParam = unionType([stringType, numberType]);
  const func = functionType().addParameter(parameter('param', unionParam));
  const result = stringify(func);

  expect(result).toBe('(param: (string | number)) => void');
});

test('parameter with intersection type adds parentheses in function context', () => {
  // Intersection has precedence 2, FunctionParameter context requires precedence 4
  // So parentheses should be added
  const intersectionParam = namedType('A & B'); // Using named type to simulate intersection
  const func = functionType().addParameter(parameter('param', intersectionParam));
  const result = stringify(func);

  // Named type has atomic precedence, no parentheses needed
  expect(result).toBe('(param: A & B) => void');
});

test('parameter with function type adds parentheses in function context', () => {
  // Function type has precedence 4, FunctionParameter context requires precedence 4
  // Since 4 is not < 4, no parentheses needed
  const funcParam = functionType().setReturnType(stringType);
  const func = functionType().addParameter(parameter('callback', funcParam));
  const result = stringify(func);

  expect(result).toBe('(callback: () => string) => void');
});

test('optional parameter with union type adds parentheses', () => {
  const unionParam = unionType([stringType, numberType]);
  const func = functionType().addParameter(parameter('param', unionParam).optional());
  const result = stringify(func);

  expect(result).toBe('(param?: (string | number)) => void');
});
