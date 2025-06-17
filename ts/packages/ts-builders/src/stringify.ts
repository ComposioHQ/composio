import type { BasicBuilder } from './BasicBuilder';
import { Writer } from './Writer';

export function assertNever(_arg: never, errorMessage: string): never {
  throw new Error(errorMessage);
}

type StringifyOptions = {
  indentLevel?: number;
  newLine?: 'none' | 'leading' | 'trailing' | 'both';
};

export function stringify(
  builder: BasicBuilder,
  { indentLevel = 0, newLine = 'none' }: StringifyOptions = {}
) {
  const str = new Writer(indentLevel, undefined).write(builder).toString();
  switch (newLine) {
    case 'none':
      return str;
    case 'leading':
      return '\n' + str;
    case 'trailing':
      return str + '\n';
    case 'both':
      return '\n' + str + '\n';
    default:
      assertNever(newLine, 'Unexpected value');
  }
}
