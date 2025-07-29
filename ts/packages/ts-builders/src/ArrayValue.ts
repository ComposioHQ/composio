import { ValueBuilder } from './ValueBuilder';
import type { Writer } from './Writer';

export class ArrayValue extends ValueBuilder {
  private items: ValueBuilder[] = [];

  add(item: ValueBuilder): this {
    this.items.push(item);
    return this;
  }

  write(writer: Writer): void {
    writer.write('[').writeJoined(', ', this.items).write(']');
  }
}
