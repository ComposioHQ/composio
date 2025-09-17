import type { BasicBuilder } from './BasicBuilder';
import { Writer } from './Writer';

export class DocSectionComment implements BasicBuilder {
  constructor(private startingText: string) {}

  write(writer: Writer): void {
    const lines = this.startingText.split('\n');

    for (const line of lines) {
      writer.writeLine(line.trimStart());
    }
  }
}

export function docSectionComment(startingText: string) {
  return new DocSectionComment(startingText);
}
