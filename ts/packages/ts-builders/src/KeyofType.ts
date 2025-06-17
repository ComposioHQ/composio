import { TypeBuilder } from './TypeBuilder';
import { Writer } from './Writer';
import { OperatorPrecedence, TypeContext } from './OperatorPrecedence';

export class KeyofType extends TypeBuilder {
  readonly precedence = OperatorPrecedence.KeyofType;

  constructor(public baseType: TypeBuilder) {
    super();
  }

  write(writer: Writer): void {
    writer.write(`keyof `);
    this.baseType.writeInContext(writer, TypeContext.KeyofOperand);
  }
}

export function keyOfType(baseType: TypeBuilder): KeyofType {
  return new KeyofType(baseType);
}
