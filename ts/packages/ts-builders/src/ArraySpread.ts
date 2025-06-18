import { TypeBuilder } from './TypeBuilder';
import { Writer } from './Writer';
import { OperatorPrecedence } from './OperatorPrecedence';

export class ArraySpread extends TypeBuilder {
  readonly precedence = OperatorPrecedence.ArrayType;

  constructor(private innerType: TypeBuilder) {
    super();
  }
  write(writer: Writer): void {
    writer.write('[...').write(this.innerType).write(']');
  }
}

export function arraySpread(innerType: TypeBuilder) {
  return new ArraySpread(innerType);
}
