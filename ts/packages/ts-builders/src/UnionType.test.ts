import { expect, test } from 'vitest';

import { array } from './ArrayType';
import { functionType } from './FunctionType';
import { namedType } from './NamedType';
import { stringify } from './stringify';
import { unionType } from './UnionType';

const A = namedType('A');
const B = namedType('B');

test('one type', () => {
  expect(stringify(unionType(A))).toMatchInlineSnapshot(`"A"`);
});

test('multiple types', () => {
  expect(stringify(unionType(A).addVariant(B))).toMatchInlineSnapshot(`"A | B"`);
});

test('from array', () => {
  expect(stringify(unionType([A, B]))).toMatchInlineSnapshot(`"A | B"`);
});

test('with function type', () => {
  expect(stringify(unionType([A, B, functionType()]))).toMatchInlineSnapshot(
    `"A | B | (() => void)"`
  );
});

test('fails with empty array', () => {
  expect(() => unionType([])).toThrowErrorMatchingInlineSnapshot(
    `[TypeError: Union types array can not be empty]`
  );
});

test('mapVariants', () => {
  const union = unionType([A, B]).mapVariants(array);
  expect(stringify(union)).toMatchInlineSnapshot(`"A[] | B[]"`);
});
