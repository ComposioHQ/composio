import type { BasicBuilder } from './BasicBuilder';
import { DocComment } from './DocComment';
import { TypeBuilder } from './TypeBuilder';
import { ValueBuilder } from './ValueBuilder';
import { Writer } from './Writer';

export class ConstDeclaration implements BasicBuilder {
  private docComment?: DocComment;
  private value?: ValueBuilder;
  private isDeclared = false;

  constructor(
    readonly name: string,
    readonly type?: TypeBuilder
  ) {}

  setDocComment(docComment: DocComment): this {
    this.docComment = docComment;
    return this;
  }

  /** Writes `declare const name: type`, the form a declaration file uses. */
  declare(): this {
    this.isDeclared = true;
    return this;
  }

  setValue(value: ValueBuilder): this {
    this.value = value;
    return this;
  }

  write(writer: Writer): void {
    if (this.docComment) {
      writer.write(this.docComment);
    }
    if (this.isDeclared) {
      writer.write('declare ');
    }
    writer.write('const ').write(this.name);
    if (this.type) {
      writer.write(': ').write(this.type);
    }
    if (this.value) {
      writer.write(' = ').write(this.value);
    }
  }
}

export function constDeclaration(name: string, type?: TypeBuilder) {
  return new ConstDeclaration(name, type);
}
