import { ValueBuilder } from './ValueBuilder';
import { PropertyValue } from './PropertyValue';
import type { Writer } from './Writer';

type ObjectTypeItem = PropertyValue;

export class ObjectValue extends ValueBuilder {
  needsParenthesisWhenIndexed = true;

  private items: ObjectTypeItem[] = [];
  private inline = false;

  add(item: ObjectTypeItem): this {
    this.items.push(item);
    return this;
  }

  addMultiple(items: ObjectTypeItem[]): this {
    for (const item of items) {
      this.add(item);
    }
    return this;
  }

  formatInline() {
    this.inline = true;
    return this;
  }

  write(writer: Writer): void {
    if (this.items.length === 0) {
      writer.write('{}');
    } else if (this.inline) {
      this.writeInline(writer);
    } else {
      this.writeMultiline(writer);
    }
  }

  private writeMultiline(writer: Writer) {
    writer
      .writeLine('{')
      .withIndent(() => {
        for (const item of this.items) {
          writer.write(item);
          writer.write(',');
          writer.newLine();
        }
      })
      .write('}');
  }

  private writeInline(writer: Writer) {
    writer.write('{ ').writeJoined(', ', this.items).write(' }');
  }
}

export function objectValue() {
  return new ObjectValue();
}
