import { TypeBuilder } from './TypeBuilder';
import { Writer } from './Writer';
import { OperatorPrecedence, TypeContext } from './OperatorPrecedence';

export class ArrayType extends TypeBuilder {
  readonly precedence = OperatorPrecedence.ArrayType;

  constructor(private elementType: TypeBuilder) {
    super();
  }

  write(writer: Writer): void {
    this.elementType.writeInContext(writer, TypeContext.ArrayElement);
    writer.write('[]');
  }
}

export function array(elementType: TypeBuilder): ArrayType {
  return new ArrayType(elementType);
}
