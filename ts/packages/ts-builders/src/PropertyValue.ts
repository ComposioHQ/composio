import { DocComment } from './DocComment';
import { WellKnownSymbol } from './WellKnownSymbol';
import { ValueBuilder } from './ValueBuilder';
import { Writer } from './Writer';
import type { BasicBuilder } from './BasicBuilder';

export class PropertyValue implements BasicBuilder {
  private isOptional = false;
  private docComment?: DocComment;

  constructor(
    public name: string | WellKnownSymbol,
    public value: ValueBuilder
  ) {}

  optional(): this {
    this.isOptional = true;
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

    if (typeof this.name === 'string') {
      writer.write(this.name);
    } else {
      writer.write('[').write(this.name).write(']');
    }

    if (this.isOptional) {
      writer.write('?');
    }
    writer.write(': ').write(this.value);
  }
}

export function propertyValue(name: string | WellKnownSymbol, value: ValueBuilder) {
  return new PropertyValue(name, value);
}
