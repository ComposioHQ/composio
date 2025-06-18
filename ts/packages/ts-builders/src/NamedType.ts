import { TypeBuilder } from './TypeBuilder';
import { Writer } from './Writer';
import { OperatorPrecedence } from './OperatorPrecedence';

export class NamedType extends TypeBuilder {
  readonly precedence = OperatorPrecedence.Atomic;
  readonly genericArguments: TypeBuilder[] = [];

  constructor(readonly name: string) {
    super();
  }

  addGenericArgument(type: TypeBuilder): this {
    this.genericArguments.push(type);
    return this;
  }

  write(writer: Writer): void {
    writer.write(this.name);
    if (this.genericArguments.length > 0) {
      writer.write('<').writeJoined(', ', this.genericArguments).write('>');
    }
  }
}

export function namedType(name: string): NamedType {
  return new NamedType(name);
}
