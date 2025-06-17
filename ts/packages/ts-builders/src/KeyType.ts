import { TypeBuilder } from './TypeBuilder';
import { NamedType } from './NamedType';
import type { Writer } from './Writer';
import { OperatorPrecedence, TypeContext } from './OperatorPrecedence';

export class KeyType extends TypeBuilder {
  readonly precedence = OperatorPrecedence.IndexAccess;

  constructor(
    public baseType: TypeBuilder,
    public key: string | NamedType
  ) {
    super();
  }

  write(writer: Writer): void {
    this.baseType.writeInContext(writer, TypeContext.IndexAccess);

    const keyIndexed = this.key instanceof NamedType ? `${this.key.name}` : `"${this.key}"`;

    writer.write('[').write(keyIndexed).write(']');
  }
}

export function keyType(baseType: TypeBuilder, key: string | NamedType) {
  return new KeyType(baseType, key);
}
