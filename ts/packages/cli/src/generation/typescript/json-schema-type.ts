/**
 * JSON Schema to TypeScript type text, without the TypeScript compiler.
 *
 * `composio generate ts --type-tools` prints each tool and trigger schema as
 * `openapi-typescript` 7 and the compiler's printer do, without depending on
 * either: the rules are openapi-typescript's schema-object transform with every
 * option at its default, and the printer writes what the compiler's printer
 * writes for those nodes, comments included. `test/src/generation/typescript/json-schema-type.test.ts`
 * compares the two on the recorded schemas.
 *
 * Two differences, both for schemas the old pipeline rejected outright: a `$ref`
 * becomes `unknown` (openapi-typescript failed on a reference it could not
 * resolve, and none can be resolved here), and nothing lints the schema first.
 */

import { isValidJsIdentifier } from '@composio/ts-builders';

type Keyword = 'boolean' | 'never' | 'number' | 'string' | 'undefined' | 'unknown';

type PropertyName =
  | { readonly kind: 'identifier'; readonly text: string }
  | { readonly kind: 'numeric'; readonly text: string }
  | { readonly kind: 'string'; readonly text: string };

type Member =
  | {
      readonly kind: 'property';
      readonly name: PropertyName;
      readonly optional: boolean;
      readonly readonly: boolean;
      readonly type: TypeNode;
      readonly comment: string | undefined;
    }
  | { readonly kind: 'index'; readonly type: TypeNode };

type TypeNode =
  | { readonly kind: 'keyword'; readonly name: Keyword }
  | { readonly kind: 'null' }
  | { readonly kind: 'true' }
  | { readonly kind: 'false' }
  /** A string literal, written as its JSON text (openapi-typescript used an identifier for it). */
  | { readonly kind: 'raw'; readonly text: string }
  | { readonly kind: 'numeric'; readonly text: string }
  | { readonly kind: 'reference'; readonly name: string; readonly args: ReadonlyArray<TypeNode> }
  | { readonly kind: 'array'; readonly element: TypeNode }
  | { readonly kind: 'tuple'; readonly elements: ReadonlyArray<TypeNode> }
  | { readonly kind: 'union'; readonly types: ReadonlyArray<TypeNode> }
  | { readonly kind: 'intersection'; readonly types: ReadonlyArray<TypeNode> }
  | { readonly kind: 'parenthesized'; readonly type: TypeNode }
  | { readonly kind: 'typeLiteral'; readonly members: ReadonlyArray<Member> };

// Singletons: openapi-typescript compares some of these by identity.
const BOOLEAN: TypeNode = { kind: 'keyword', name: 'boolean' };
const NEVER: TypeNode = { kind: 'keyword', name: 'never' };
const NUMBER: TypeNode = { kind: 'keyword', name: 'number' };
const STRING: TypeNode = { kind: 'keyword', name: 'string' };
const UNKNOWN: TypeNode = { kind: 'keyword', name: 'unknown' };
const NULL: TypeNode = { kind: 'null' };
const TRUE: TypeNode = { kind: 'true' };
const FALSE: TypeNode = { kind: 'false' };

/** A JSON Schema as decoded JSON: any value, inspected the way JavaScript would. */
type Json = unknown;
type JsonObject = { readonly [key: string]: Json };

/** JavaScript's `in`, which throws on a primitive the way openapi-typescript's code did. */
const has = (value: Json, key: string): boolean => {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    throw new TypeError(`Cannot use 'in' operator to search for '${key}' in ${String(value)}`);
  }
  return key in value;
};

const field = (value: Json, key: string): Json =>
  value !== null && typeof value === 'object' ? (value as JsonObject)[key] : undefined;

const isObject = (value: Json): value is JsonObject => typeof value === 'object' && value !== null;

/** `required.includes(key)` on whatever `required` is, failing like JavaScript when it has no `includes`. */
const requiredIncludes = (value: Json, key: string): boolean => {
  const method =
    isObject(value) || typeof value === 'string'
      ? (value as { includes?: unknown }).includes
      : undefined;
  if (typeof method !== 'function') {
    throw new TypeError('required.includes is not a function');
  }
  return Boolean((method as (key: string) => unknown).call(value, key));
};

const trimmed = (value: Json, what: string): string => {
  if (typeof value !== 'string') {
    throw new TypeError(`${what}.trim is not a function`);
  }
  return value.trim();
};

/** Entries of an array or object, as `Object.entries` returns them. */
const entries = (value: Json): ReadonlyArray<readonly [string, Json]> => {
  if (value === null || value === undefined) {
    throw new TypeError('Cannot convert undefined or null to object');
  }
  return Object.entries(value as object);
};

const keyCount = (value: Json): number => {
  if (value === null || value === undefined) {
    throw new TypeError('Cannot convert undefined or null to object');
  }
  return Object.keys(value as object).length;
};

const asArray = (value: Json, what: string): ReadonlyArray<Json> => {
  if (!Array.isArray(value)) {
    throw new TypeError(`${what} is not iterable`);
  }
  return value;
};

// ---------------------------------------------------------------------------
// Node constructors, with the compiler factory's parenthesization rules.
// ---------------------------------------------------------------------------

const isPrimitive = (type: TypeNode): boolean =>
  type.kind === 'null' || (type.kind === 'keyword' && type.name !== 'unknown');

const dedupe = (types: ReadonlyArray<TypeNode>): ReadonlyArray<TypeNode> => {
  const seen = new Set<string>();
  return types.filter(type => {
    if (!isPrimitive(type)) return true;
    const key = type.kind === 'keyword' ? type.name : type.kind;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const parenthesizeConstituent = (type: TypeNode): TypeNode =>
  type.kind === 'union' || type.kind === 'intersection' ? { kind: 'parenthesized', type } : type;

const unionNode = (types: ReadonlyArray<TypeNode>): TypeNode => ({
  kind: 'union',
  types: types.map(parenthesizeConstituent),
});

const intersectionNode = (types: ReadonlyArray<TypeNode>): TypeNode => ({
  kind: 'intersection',
  types: types.map(parenthesizeConstituent),
});

const union = (types: ReadonlyArray<TypeNode>): TypeNode =>
  types.length === 0 ? NEVER : types.length === 1 ? types[0]! : unionNode(dedupe(types));

const intersection = (types: ReadonlyArray<TypeNode>): TypeNode =>
  types.length === 0 ? NEVER : types.length === 1 ? types[0]! : intersectionNode(dedupe(types));

const arrayOf = (element: TypeNode): TypeNode => ({
  kind: 'array',
  element: parenthesizeConstituent(element),
});

const reference = (name: string, args: ReadonlyArray<TypeNode> = []): TypeNode => ({
  kind: 'reference',
  name,
  args,
});

const typeLiteral = (members: ReadonlyArray<Member>): TypeNode => ({
  kind: 'typeLiteral',
  members,
});

const JS_PROPERTY_INDEX_RE = /^[A-Za-z_$][A-Za-z_$0-9]*$/;

const propertyName = (index: string): PropertyName =>
  String(Number(index)) === index && index[0] !== '-'
    ? { kind: 'numeric', text: index }
    : JS_PROPERTY_INDEX_RE.test(index)
      ? { kind: 'identifier', text: index }
      : { kind: 'string', text: index };

const property = (
  name: string,
  type: TypeNode,
  options: { optional?: boolean; readonly?: boolean; comment?: string | undefined } = {}
): Member => ({
  kind: 'property',
  name: propertyName(name),
  optional: options.optional ?? false,
  readonly: options.readonly ?? false,
  type,
  comment: options.comment,
});

const literal = (value: Json): TypeNode => {
  if (typeof value === 'string') return { kind: 'raw', text: JSON.stringify(value) };
  if (typeof value === 'number') {
    return { kind: 'numeric', text: value < 0 ? `-${String(Math.abs(value))}` : String(value) };
  }
  if (typeof value === 'boolean') return value ? TRUE : FALSE;
  if (value === null) return NULL;
  if (Array.isArray(value)) {
    return value.length === 0 ? arrayOf(NEVER) : { kind: 'tuple', elements: value.map(literal) };
  }
  if (typeof value === 'object') {
    const members = Object.entries(value).map(([key, item]) => property(key, literal(item)));
    return members.length > 0 ? typeLiteral(members) : reference('Record', [STRING, NEVER]);
  }
  return UNKNOWN;
};

// ---------------------------------------------------------------------------
// The schema-object transform.
// ---------------------------------------------------------------------------

const escapePointer = (part: string) => part.replace(/~/g, '~0').replace(/\//g, '~1');

/** The JSON pointer of a schema, as openapi-typescript built it; only its text is ever read. */
const childPath = (path: string, ...parts: ReadonlyArray<string>): string =>
  parts.reduce((acc, part) => {
    if (part === '') return acc;
    const hash = part.indexOf('#/');
    const segments =
      hash === -1
        ? [part]
        : part
            .slice(hash + 2)
            .split('/')
            .filter(Boolean);
    return segments.reduce((inner, segment) => `${inner}/${escapePointer(segment)}`, acc);
  }, path);

const LB_RE = /\r?\n/g;

/**
 * A schema keyword's value as openapi-typescript's template literals printed it:
 * `String(value)`, including `[object Object]` for an object, which the
 * byte-for-byte output comparison keeps.
 */
const printedLikeTemplate = (value: Json): string => String(value as string);

/** The JSDoc comment openapi-typescript attached to a property, or nothing. */
const jsDocComment = (schema: Json): string | undefined => {
  if (!isObject(schema) || Array.isArray(schema)) return undefined;
  const output: Array<string> = [];
  const serialize = (value: Json) =>
    (typeof value === 'object' ? JSON.stringify(value, null, 2) : printedLikeTemplate(value))
      .trim()
      .replace(LB_RE, '\n *     ');
  if (schema['title']) output.push(trimmed(schema['title'], 'title').replace(LB_RE, '\n *     '));
  if (schema['summary']) {
    output.push(trimmed(schema['summary'], 'summary').replace(LB_RE, '\n *     '));
  }
  if (schema['format']) output.push(`Format: ${printedLikeTemplate(schema['format'])}`);
  if (schema['deprecated']) output.push('@deprecated');
  for (const name of ['description', 'default', 'example'] as const) {
    const value = schema[name];
    if (value === undefined) continue;
    if (value === '' && name === 'description') continue;
    output.push(`@${name} ${serialize(value)}`);
  }
  if (Array.isArray(schema['examples'])) {
    for (const example of schema['examples']) output.push(`@example ${serialize(example)}`);
  }
  if ('const' in schema) output.push('@constant');
  if (schema['enum']) {
    const type = schema['type'];
    const name = Array.isArray(type) ? type.join('|') : typeof type === 'string' ? type : 'unknown';
    output.push(`@enum {${name}${schema['nullable'] ? '|null' : ''}}`);
  }
  if (output.length === 0) return undefined;
  const multiline = output.some(item => item.includes('\n'));
  const text =
    output.length === 1 && !multiline
      ? `* ${output.join('\n')} `
      : `*\n * ${output.join('\n * ')}\n `;
  return `/*${text.replace(/\*\//g, '*\\/')}*/`;
};

const transform = (schema: Json, path: string): TypeNode => {
  if (!schema) return NEVER;
  if (schema === true) return UNKNOWN;
  if (Array.isArray(schema) || typeof schema !== 'object') {
    throw new Error(
      `Expected SchemaObject, received ${Array.isArray(schema) ? 'Array' : typeof schema} at ${path}`
    );
  }
  const node = schema as JsonObject;
  if ('$ref' in node) return UNKNOWN;
  if (node['const'] !== null && node['const'] !== undefined) return literal(node['const']);
  if (
    Array.isArray(node['enum']) &&
    (!('type' in node) || node['type'] !== 'object') &&
    !('properties' in node) &&
    !('additionalProperties' in node)
  ) {
    const members = node['enum'].map(literal);
    if ((Array.isArray(node['type']) && node['type'].includes('null')) || node['nullable']) {
      members.push(NULL);
    }
    return union(members);
  }

  const collectUnion = (items: Json, key: string): Array<TypeNode> =>
    asArray(items, key).map((item, index) => transform(item, childPath(path, key, String(index))));

  const collectAllOf = (items: Json, required: Json): Array<TypeNode> =>
    asArray(items, 'allOf').map(item => {
      if (has(item, '$ref')) return UNKNOWN;
      const itemRequired = [...asArray(required ?? [], 'required')];
      if (isObject(item) && Array.isArray(item['required'])) itemRequired.push(...item['required']);
      const type = transform({ ...(item as JsonObject), required: itemRequired }, path);
      const discriminator = field(item, 'discriminator');
      return discriminator
        ? reference('Omit', [type, unionNode([literal(field(discriminator, 'propertyName'))])])
        : type;
    });

  let finalType: TypeNode | undefined;
  const core = transformCore(node, path);
  const allOf = collectAllOf(node['allOf'] ?? [], node['required']);
  if (core || allOf.length > 0) {
    const allOfType = allOf.length > 0 ? intersection(allOf) : undefined;
    finalType = intersection([...(core ? [core] : []), ...(allOfType ? [allOfType] : [])]);
  }
  const anyOf = collectUnion(node['anyOf'] ?? [], 'anyOf');
  if (anyOf.length > 0) finalType = union([...(finalType ? [finalType] : []), ...anyOf]);
  const oneOf = collectUnion(
    node['oneOf'] || ('type' in node && node['type'] === 'object' && node['enum']) || [],
    'oneOf'
  );
  if (oneOf.length > 0) {
    finalType = oneOf.every(isPrimitive)
      ? union([...(finalType ? [finalType] : []), ...oneOf])
      : intersection([...(finalType ? [finalType] : []), union(oneOf)]);
  }
  if (!finalType) {
    finalType = 'type' in node ? reference('Record', [STRING, NEVER]) : UNKNOWN;
  }
  if (finalType !== UNKNOWN && node['nullable']) finalType = unionNode([finalType, NULL]);
  return finalType;
};

const PRIMITIVE_TYPE_NAMES: ReadonlyArray<Json> = [
  'boolean',
  'string',
  'number',
  'integer',
  'null',
];

const transformCore = (node: JsonObject, path: string): TypeNode | undefined => {
  const type = node['type'];
  if ('type' in node && type) {
    if (type === 'null') return NULL;
    if (type === 'string') return STRING;
    if (type === 'number' || type === 'integer') return NUMBER;
    if (type === 'boolean') return BOOLEAN;
    if (type === 'array') {
      let itemType: TypeNode = UNKNOWN;
      const items = node['items'];
      if (node['prefixItems'] || Array.isArray(items)) {
        const prefixItems = node['prefixItems'] ?? items;
        itemType = {
          kind: 'tuple',
          elements: asArray(prefixItems, 'prefixItems').map(item => transform(item, path)),
        };
      } else if (items) {
        itemType =
          isObject(items) && 'type' in items && items['type'] === 'array'
            ? arrayOf(transform(items, path))
            : transform(items, path);
      }
      return itemType.kind === 'tuple' || itemType.kind === 'array' ? itemType : arrayOf(itemType);
    }
    if (Array.isArray(type)) {
      const oneOf = node['oneOf'];
      const types: Array<TypeNode> = [];
      for (const each of type) {
        if (Array.isArray(oneOf)) {
          if (
            PRIMITIVE_TYPE_NAMES.includes(each) &&
            oneOf.find(
              item => typeof item === 'object' && has(item, 'type') && field(item, 'type') === each
            )
          ) {
            continue;
          }
          types.push(
            each === 'null' || each === null
              ? NULL
              : transform({ ...node, type: each, oneOf: undefined }, path)
          );
        } else {
          types.push(
            each === 'null' || each === null ? NULL : transform({ ...node, type: each }, path)
          );
        }
      }
      return union(types);
    }
  }

  const members: Array<Member> = [];
  const properties = node['properties'];
  const additional = node['additionalProperties'];
  const patterns = node['patternProperties'];
  const defs = node['$defs'];
  if (
    ('properties' in node && properties && keyCount(properties) > 0) ||
    ('additionalProperties' in node && additional) ||
    ('patternProperties' in node && patterns) ||
    ('$defs' in node && defs)
  ) {
    if (keyCount(properties ?? {}) > 0) {
      for (const [key, value] of entries(properties ?? {})) {
        if ((typeof value !== 'object' && typeof value !== 'boolean') || Array.isArray(value)) {
          throw new Error(
            `${path}: invalid property ${key}. Expected Schema Object or boolean, got ${Array.isArray(value) ? 'Array' : typeof value}`
          );
        }
        const flags =
          typeof value === 'object'
            ? {
                ref: has(value, '$ref') && field(value, '$ref'),
                readOnly: has(value, 'readOnly') && field(value, 'readOnly'),
                hasDefault: has(value, 'default') && field(value, 'default') !== undefined,
              }
            : { ref: undefined, readOnly: undefined, hasDefault: undefined };
        const required = node['required'];
        const optional = !(
          (required !== undefined && required !== null && requiredIncludes(required, key)) ||
          (flags.hasDefault &&
            !path.includes('parameters') &&
            !path.includes('requestBody') &&
            !path.includes('requestBodies'))
        );
        const propertyType = flags.ref ? UNKNOWN : transform(value, childPath(path, key));
        members.push(
          property(key, propertyType, {
            optional,
            readonly: Boolean(flags.readOnly),
            comment: jsDocComment(value),
          })
        );
      }
    }
    if (defs && typeof defs === 'object' && keyCount(defs) > 0) {
      const defMembers = entries(defs).map(([key, value]) =>
        property(key, transform(value, childPath(path, '$defs', key)), {
          readonly: has(value, 'readOnly') && Boolean(field(value, 'readOnly')),
          comment: jsDocComment(value),
        })
      );
      members.push(property('$defs', typeLiteral(defMembers)));
    }
    const explicitAdditional = typeof additional === 'object' && keyCount(additional) > 0;
    const implicitAdditional =
      additional === true || (typeof additional === 'object' && keyCount(additional) === 0);
    const explicitPatterns = typeof patterns === 'object' && keyCount(patterns) > 0;
    const indexTypes: Array<TypeNode> = [];
    if (explicitAdditional) indexTypes.push(transform(additional, path));
    if (implicitAdditional) indexTypes.push(UNKNOWN);
    if (explicitPatterns) {
      for (const [, value] of entries(patterns)) indexTypes.push(transform(value, path));
    }
    if (indexTypes.length === 0) return members.length > 0 ? typeLiteral(members) : undefined;
    return intersection([
      ...(members.length > 0 ? [typeLiteral(members)] : []),
      typeLiteral([{ kind: 'index', type: union(indexTypes) }]),
    ]);
  }
  return members.length > 0 ? typeLiteral(members) : undefined;
};

// ---------------------------------------------------------------------------
// The printer: what the compiler's printer wrote for these nodes.
// ---------------------------------------------------------------------------

const INDENT = '    ';

/** Line starts as the compiler counts them: CRLF, CR, LF, U+2028 and U+2029 end a line. */
const lineStarts = (text: string): Array<number> => {
  const starts: Array<number> = [];
  let position = 0;
  let lineStart = 0;
  while (position < text.length) {
    const code = text.charCodeAt(position);
    position++;
    if (code === 13) {
      if (text.charCodeAt(position) === 10) position++;
      starts.push(lineStart);
      lineStart = position;
    } else if (code === 10 || code === 0x2028 || code === 0x2029) {
      starts.push(lineStart);
      lineStart = position;
    }
  }
  starts.push(lineStart);
  return starts;
};

const isSingleLineWhitespace = (code: number) =>
  code === 32 ||
  code === 9 ||
  code === 11 ||
  code === 12 ||
  code === 0xa0 ||
  code === 0x85 ||
  code === 0x1680 ||
  (code >= 0x2000 && code <= 0x200b) ||
  code === 0x202f ||
  code === 0x205f ||
  code === 0x3000 ||
  code === 0xfeff;

const leadingIndent = (text: string, start: number, end: number): number => {
  let indent = 0;
  for (
    let position = start;
    position < end && isSingleLineWhitespace(text.charCodeAt(position));
    position++
  ) {
    indent += text.charCodeAt(position) === 9 ? INDENT.length - (indent % INDENT.length) : 1;
  }
  return indent;
};

class TextWriter {
  private output = '';
  private atLineStart = true;
  indent = 0;

  write(text: string) {
    if (text.length === 0) return;
    const prefixed = this.atLineStart ? INDENT.repeat(this.indent) + text : text;
    this.atLineStart = false;
    this.append(prefixed);
  }

  rawWrite(text: string) {
    this.append(text);
  }

  writeLine() {
    if (!this.atLineStart) {
      this.output += '\n';
      this.atLineStart = true;
    }
  }

  private append(text: string) {
    this.output += text;
    const starts = lineStarts(text);
    this.atLineStart = starts.length > 1 && starts[starts.length - 1] === text.length;
  }

  toString() {
    return this.output;
  }
}

/** A synthesized `/* … *\/` comment, re-indented line by line the way the printer did it. */
const writeComment = (writer: TextWriter, text: string) => {
  const starts = lineStarts(text);
  for (let line = 0, position = 0; position < text.length; line++) {
    const nextLineStart = line + 1 === starts.length ? text.length + 1 : starts[line + 1]!;
    if (position !== 0) {
      const spaces = writer.indent * INDENT.length + leadingIndent(text, position, nextLineStart);
      writer.rawWrite(spaces > 0 ? ' '.repeat(spaces) : '');
    }
    const end = Math.min(text.length, nextLineStart - 1);
    const current = text.substring(position, end).trim();
    if (current) {
      writer.write(current);
      if (end !== text.length) writer.writeLine();
    } else {
      writer.rawWrite('\n');
    }
    position = nextLineStart;
  }
  writer.writeLine();
};

const ESCAPED_CHARS: Readonly<Record<string, string>> = {
  '\t': '\\t',
  '\v': '\\v',
  '\f': '\\f',
  '\b': '\\b',
  '\r': '\\r',
  '\n': '\\n',
  '\\': '\\\\',
  '"': '\\"',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
  '\u0085': '\\u0085',
};

const utf16Escape = (code: number) => `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`;

/** A double-quoted string literal as the printer wrote it: non-ASCII characters escaped. */
const stringLiteral = (text: string): string => {
  const escaped = text.replace(
    /[\\"\u0000-\u001f\u2028\u2029\u0085]/g,
    (char, offset: number, input: string) => {
      if (char === '\0') {
        const next = input.charCodeAt(offset + 1);
        return next >= 48 && next <= 57 ? '\\x00' : '\\0';
      }
      return ESCAPED_CHARS[char] ?? utf16Escape(char.charCodeAt(0));
    }
  );
  return `"${escaped.replace(/[^\u0000-\u007F]/g, char => utf16Escape(char.charCodeAt(0)))}"`;
};

const writeName = (writer: TextWriter, name: PropertyName) =>
  writer.write(name.kind === 'string' ? stringLiteral(name.text) : name.text);

const writeType = (writer: TextWriter, type: TypeNode): void => {
  switch (type.kind) {
    case 'keyword':
      return writer.write(type.name);
    case 'null':
    case 'true':
    case 'false':
      return writer.write(type.kind);
    case 'raw':
    case 'numeric':
      return writer.write(type.text);
    case 'reference':
      writer.write(type.name);
      if (type.args.length > 0) {
        writer.write('<');
        type.args.forEach((arg, index) => {
          if (index > 0) writer.write(', ');
          writeType(writer, arg);
        });
        writer.write('>');
      }
      return;
    case 'array':
      writeType(writer, type.element);
      return writer.write('[]');
    case 'tuple':
      // The printer lays a synthesized tuple out one element per line.
      writer.write('[');
      writer.writeLine();
      writer.indent++;
      type.elements.forEach((element, index) => {
        if (index > 0) {
          writer.write(',');
          writer.writeLine();
        }
        writeType(writer, element);
      });
      writer.indent--;
      writer.writeLine();
      return writer.write(']');
    case 'union':
    case 'intersection':
      type.types.forEach((member, index) => {
        if (index > 0) writer.write(type.kind === 'union' ? ' | ' : ' & ');
        writeType(writer, member);
      });
      return;
    case 'parenthesized':
      writer.write('(');
      writeType(writer, type.type);
      return writer.write(')');
    case 'typeLiteral':
      writer.write('{');
      if (type.members.length > 0) {
        writer.writeLine();
        writer.indent++;
        type.members.forEach((member, index) => {
          if (index > 0) writer.writeLine();
          writeMember(writer, member);
        });
        writer.indent--;
        writer.writeLine();
      }
      return writer.write('}');
  }
};

const writeMember = (writer: TextWriter, member: Member) => {
  if (member.kind === 'index') {
    writer.write('[key: string]: ');
    writeType(writer, member.type);
    return writer.write(';');
  }
  if (member.comment !== undefined) writeComment(writer, member.comment);
  if (member.readonly) writer.write('readonly ');
  writeName(writer, member.name);
  writer.write(member.optional ? '?: ' : ': ');
  writeType(writer, member.type);
  writer.write(';');
};

/**
 * `type <name> = …;` for an object schema's `properties`, indented the way the
 * CLI always printed it (two spaces at the first level). An object with no
 * properties is `object`.
 *
 * Throws where openapi-typescript threw: a schema that is not an object or a
 * boolean, or a keyword whose value has the wrong JSON type. Also throws when
 * `name` is not an identifier: it comes from tool and trigger slugs, and is
 * written into the generated module as is.
 */
export const printTypeFromJsonSchema = (name: string, properties: Json): string => {
  if (!isValidJsIdentifier(name)) {
    throw new Error(`${JSON.stringify(name)} is not a valid TypeScript type name`);
  }
  const root = transform(
    { type: 'object', properties },
    `#/components/schemas/${escapePointer(name)}`
  );
  const type =
    root.kind === 'typeLiteral'
      ? root.members.length === 0
        ? reference('object')
        : root
      : root.kind === 'reference' && (root.name === 'object' || root.name === 'Record')
        ? reference('object')
        : reference('unknown');
  const writer = new TextWriter();
  writer.write(`type ${name} = `);
  writeType(writer, type);
  writer.write(';');
  return writer.toString().replace(/^ {4}/gm, '  ');
};
