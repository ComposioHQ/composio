/**
 * The printer behind `printTypeFromJsonSchema`: what the TypeScript compiler's
 * printer wrote for a `TypeNode`, comments included.
 */

import type { Member, PropertyName, TypeNode } from './type-node';

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
  constructor(readonly comments: boolean) {}
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
    const last = text.charCodeAt(text.length - 1);
    this.atLineStart = last === 10 || last === 13 || last === 0x2028 || last === 0x2029;
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
  if (writer.comments && member.comment !== undefined) writeComment(writer, member.comment);
  if (member.readonly) writer.write('readonly ');
  writeName(writer, member.name);
  writer.write(member.optional ? '?: ' : ': ');
  writeType(writer, member.type);
  writer.write(';');
};

/** `type <name> = …;`, indented two spaces at the first level. */
export const printTypeAlias = (
  name: string,
  type: TypeNode,
  options: { readonly comments: boolean }
): string => {
  const writer = new TextWriter(options.comments);
  writer.write(`type ${name} = `);
  writeType(writer, type);
  writer.write(';');
  return writer.toString().replace(/^ {4}/gm, '  ');
};
