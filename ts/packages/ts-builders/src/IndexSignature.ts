import type { BasicBuilder } from './BasicBuilder';
import { DocComment } from './DocComment';
import { TypeBuilder } from './TypeBuilder';
import { Writer } from './Writer';

export class IndexSignature implements BasicBuilder {
  private isReadonly = false;
  private docComment?: DocComment;

  constructor(
    private keyName: string,
    private keyType: TypeBuilder,
    private valueType: TypeBuilder
  ) {}

  readonly(): this {
    this.isReadonly = true;
    return this;
  }

  setDocComment(docComment: DocComment): this {
    this.docComment = docComment;
    return this;
  }

  write(writer: Writer): void {
    if (this.docComment) {
      writer.write(this.docComment);
    }
    if (this.isReadonly) {
      writer.write('readonly ');
    }
    writer
      .write('[')
      .write(this.keyName)
      .write(': ')
      .write(this.keyType)
      .write(']: ')
      .write(this.valueType);
  }
}

export function indexSignature(keyName: string, keyType: TypeBuilder, valueType: TypeBuilder) {
  return new IndexSignature(keyName, keyType, valueType);
}
