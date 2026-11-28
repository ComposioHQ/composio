/** The TypeScript type nodes `printTypeFromJsonSchema` builds and prints. */

export type Keyword = 'boolean' | 'never' | 'number' | 'string' | 'undefined' | 'unknown';

export type PropertyName =
  | { readonly kind: 'identifier'; readonly text: string }
  | { readonly kind: 'numeric'; readonly text: string }
  | { readonly kind: 'string'; readonly text: string };

export type Member =
  | {
      readonly kind: 'property';
      readonly name: PropertyName;
      readonly optional: boolean;
      readonly readonly: boolean;
      readonly type: TypeNode;
      readonly comment: string | undefined;
    }
  | { readonly kind: 'index'; readonly type: TypeNode };

export type TypeNode =
  | { readonly kind: 'keyword'; readonly name: Keyword }
  | { readonly kind: 'null' }
  | { readonly kind: 'true' }
  | { readonly kind: 'false' }
  /** A string literal, written as its JSON text. */
  | { readonly kind: 'raw'; readonly text: string }
  | { readonly kind: 'numeric'; readonly text: string }
  | { readonly kind: 'reference'; readonly name: string; readonly args: ReadonlyArray<TypeNode> }
  | { readonly kind: 'array'; readonly element: TypeNode }
  | { readonly kind: 'tuple'; readonly elements: ReadonlyArray<TypeNode> }
  | { readonly kind: 'union'; readonly types: ReadonlyArray<TypeNode> }
  | { readonly kind: 'intersection'; readonly types: ReadonlyArray<TypeNode> }
  | { readonly kind: 'parenthesized'; readonly type: TypeNode }
  | { readonly kind: 'typeLiteral'; readonly members: ReadonlyArray<Member> };
