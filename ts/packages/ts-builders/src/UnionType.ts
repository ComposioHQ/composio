import { TypeBuilder } from './TypeBuilder';
import { Writer } from './Writer';
import { OperatorPrecedence, TypeContext } from './OperatorPrecedence';

export class UnionType<VariantType extends TypeBuilder = TypeBuilder> extends TypeBuilder {
  readonly precedence = OperatorPrecedence.Union;
  readonly variants: VariantType[];
  private multiline = false;

  constructor(firstType: VariantType) {
    super();
    this.variants = [firstType];
  }

  addVariant(variant: VariantType) {
    this.variants.push(variant);
    return this;
  }

  addVariants(variants: VariantType[]) {
    for (const variant of variants) {
      this.addVariant(variant);
    }
    return this;
  }

  /**
   * Format this union type in multi-line style:
   * type SomeUnion =
   *   | UnionVariantA
   *   | UnionVariantB
   *   | UnionVariantC;
   */
  formatMultiline() {
    this.multiline = true;
    return this;
  }

  write(writer: Writer): void {
    if (this.multiline) {
      this.writeMultiline(writer);
    } else {
      this.writeInline(writer);
    }
  }

  private writeInline(writer: Writer): void {
    writer.writeJoined(' | ', this.variants, (variant, writer) => {
      variant.writeInContext(writer, TypeContext.UnionMember);
    });
  }

  private writeMultiline(writer: Writer): void {
    if (this.variants.length === 0) {
      return;
    }

    const nestedWriter = writer.writeLine('').indent();

    // All variants with pipe symbol and indentation
    for (let i = 0; i < this.variants.length; i++) {
      if (i > 0) {
        nestedWriter.writeLine('');
      }

      nestedWriter.write('| ');
      this.variants[i].writeInContext(nestedWriter, TypeContext.UnionMember);
    }
  }

  mapVariants<NewVariantType extends TypeBuilder>(
    callback: (type: VariantType) => NewVariantType
  ): UnionType<NewVariantType> {
    return unionType(this.variants.map(v => callback(v)));
  }
}

export function unionType<VariantType extends TypeBuilder = TypeBuilder>(
  types: VariantType[] | VariantType
) {
  if (Array.isArray(types)) {
    if (types.length === 0) {
      throw new TypeError('Union types array can not be empty');
    }
    const union = new UnionType(types[0]);
    for (let i = 1; i < types.length; i++) {
      union.addVariant(types[i]);
    }
    return union;
  }
  return new UnionType(types);
}
