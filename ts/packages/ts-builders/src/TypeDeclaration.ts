import type { BasicBuilder } from './BasicBuilder';
import { DocComment } from './DocComment';
import { GenericParameter } from './GenericParameter';
import { TypeBuilder } from './TypeBuilder';
import { Writer } from './Writer';

export class TypeDeclaration<InnerType extends TypeBuilder = TypeBuilder> implements BasicBuilder {
  private genericParameters: GenericParameter[] = [];
  private docComment?: DocComment;

  constructor(
    public name: string,
    private type: InnerType | string
  ) {}

  addGenericParameter(param: GenericParameter): this {
    this.genericParameters.push(param);
    return this;
  }

  setName(name: string) {
    this.name = name;
    return this;
  }

  setValue(typeDecl: string) {
    this.type = typeDecl;
  }

  setDocComment(docComment: DocComment): this {
    this.docComment = docComment;
    return this;
  }

  write(writer: Writer): void {
    if (this.docComment) {
      writer.write(this.docComment);
    }

    if (typeof this.type === 'string') {
      writer.write(this.type);
      return;
    }

    writer.write('type ').write(this.name);
    if (this.genericParameters.length > 0) {
      writer.write('<').writeJoined(', ', this.genericParameters).write('>');
    }
    writer.write(' = ').write(this.type);
  }
}

export function typeDeclaration<InnerType extends TypeBuilder = TypeBuilder>(
  name: string,
  type: InnerType | string
) {
  return new TypeDeclaration(name, type);
}
