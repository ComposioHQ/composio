import type { BasicBuilder } from './BasicBuilder';
import { Writer } from './Writer';
import { OperatorPrecedence, TypeContext, needsParentheses } from './OperatorPrecedence';

export abstract class TypeBuilder implements BasicBuilder {
  /**
   * The precedence level of this type builder.
   * Used to determine when parentheses are needed automatically.
   */
  abstract readonly precedence: OperatorPrecedence;

  abstract write(writer: Writer): void;

  /**
   * Writes this type with parentheses if needed in the given context
   */
  writeInContext(writer: Writer, context: TypeContext): void {
    if (needsParentheses(this.precedence, context)) {
      writer.write('(');
      this.write(writer);
      writer.write(')');
    } else {
      this.write(writer);
    }
  }

  /**
   * @deprecated Use writeInContext with TypeContext.IndexAccess instead
   */
  writeIndexed(writer: Writer) {
    this.writeInContext(writer, TypeContext.IndexAccess);
  }
}
