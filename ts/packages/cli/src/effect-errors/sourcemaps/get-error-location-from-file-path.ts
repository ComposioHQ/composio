import { sourceFileWithMapPointerRegex } from 'effect-errors/logic/stack';

export interface ErrorLocation {
  filePath: string;
  line: number;
  column: number;
}

export const getErrorLocationFrom = (sourceFile: string): ErrorLocation | undefined => {
  const regex = sourceFileWithMapPointerRegex.exec(sourceFile);
  if (regex === null || regex.length !== 7) {
    return;
  }

  const filePath = regex[2];
  const line = +regex[5];
  const column = +regex[6];

  return { filePath, line, column };
};
