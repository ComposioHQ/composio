import { expect, test } from 'vitest';

import { docComment } from './DocComment';
import { genericParameter } from './GenericParameter';
import { namedType } from './NamedType';
import { stringify } from './stringify';
import { typeDeclaration } from './TypeDeclaration';

const A = namedType('A');

test('basic', () => {
  expect(stringify(typeDeclaration('B', A))).toMatchInlineSnapshot(`"type B = A"`);
});

test('with doc comment', () => {
  const decl = typeDeclaration('B', A).setDocComment(docComment('Type for stuff'));
  expect(stringify(decl)).toMatchInlineSnapshot(`
    "/**
     * Type for stuff
     */
    type B = A"
  `);
});

test('with generic parameters', () => {
  const decl = typeDeclaration('B', A).addGenericParameter(genericParameter('T'));
  expect(stringify(decl)).toMatchInlineSnapshot(`"type B<T> = A"`);
});

test('with multiple generic parameters', () => {
  const decl = typeDeclaration('B', A)
    .addGenericParameter(genericParameter('T'))
    .addGenericParameter(genericParameter('U'));
  expect(stringify(decl)).toMatchInlineSnapshot(`"type B<T, U> = A"`);
});

// A slug reaches this builder as a type-declaration name. Written verbatim it can
// terminate the declaration and inject top-level statements that run at import.
// A type name has no computed-key form, so the only safe response is to refuse.
test('refuses a type name that is not a valid identifier', () => {
  const malicious = 'X = any;\nconst __pwned = (() => { globalThis.__PWNED__ = 1; })();\ntype Y';

  expect(() => stringify(typeDeclaration(malicious, A))).toThrow(
    /not a valid TypeScript identifier/
  );
});

test('refuses a type name with a dash', () => {
  expect(() => stringify(typeDeclaration('FOO-BAR', A))).toThrow(
    /not a valid TypeScript identifier/
  );
});

test('a string type body still short-circuits without touching the name', () => {
  expect(stringify(typeDeclaration('B', 'export type B = A'))).toMatchInlineSnapshot(
    `"export type B = A"`
  );
});
