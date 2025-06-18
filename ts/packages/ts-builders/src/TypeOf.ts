import { TypeBuilder } from './TypeBuilder';
import type { Writer } from './Writer';
import { OperatorPrecedence, TypeContext } from './OperatorPrecedence';

export class TypeofType extends TypeBuilder {
  readonly precedence = OperatorPrecedence.TypeofType;

  constructor(public baseType: TypeBuilder) {
    super();
  }

  write(writer: Writer): void {
    writer.write(`typeof `);
    this.baseType.writeInContext(writer, TypeContext.TypeofOperand);
  }
}

export function typeOfType(baseType: TypeBuilder): TypeofType {
  return new TypeofType(baseType);
}
