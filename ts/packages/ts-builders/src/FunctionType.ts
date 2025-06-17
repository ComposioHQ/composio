import { GenericParameter } from './GenericParameter';
import { Parameter } from './Parameter';
import { voidType } from './PrimitiveType';
import { TypeBuilder } from './TypeBuilder';
import { Writer } from './Writer';
import { OperatorPrecedence, TypeContext } from './OperatorPrecedence';

export class FunctionType extends TypeBuilder {
  readonly precedence = OperatorPrecedence.FunctionType;
  private returnType: TypeBuilder = voidType;
  private parameters: Parameter[] = [];
  private genericParameters: GenericParameter[] = [];

  setReturnType(returnType: TypeBuilder): this {
    this.returnType = returnType;
    return this;
  }

  addParameter(param: Parameter): this {
    this.parameters.push(param);
    return this;
  }

  addGenericParameter(param: GenericParameter): this {
    this.genericParameters.push(param);
    return this;
  }

  write(writer: Writer): void {
    if (this.genericParameters.length > 0) {
      writer.write('<').writeJoined(', ', this.genericParameters).write('>');
    }
    writer.write('(').writeJoined(', ', this.parameters).write(') => ');
    this.returnType.writeInContext(writer, TypeContext.FunctionReturn);
  }
}

export function functionType(): FunctionType {
  return new FunctionType();
}
