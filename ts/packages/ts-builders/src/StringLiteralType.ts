import { TypeBuilder } from './TypeBuilder';
import { ValueBuilder } from './ValueBuilder';
import { Writer } from './Writer';
import { OperatorPrecedence } from './OperatorPrecedence';
import { escapeStringContent } from './QuoteStyle';

export class StringLiteralType extends TypeBuilder {
  readonly precedence = OperatorPrecedence.Atomic;

  constructor(readonly content: string) {
    super();
  }

  write(writer: Writer): void {
    const escaped = escapeStringContent(this.content, writer.formattingOptions.quoteStyle);
    writer.write(escaped);
  }

  asValue(): StringLiteralValue {
    return new StringLiteralValue(this);
  }
}

export class StringLiteralValue extends ValueBuilder {
  #type: StringLiteralType;

  constructor(type: StringLiteralType) {
    super();
    this.#type = type;
  }

  override write(writer: Writer): void {
    writer.write(this.#type);
  }
}

export function stringLiteral(content: string) {
  return new StringLiteralType(content);
}
