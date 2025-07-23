import colors from 'picocolors';
import { S_BAR, S_BAR_H, unicodeOr } from '@clack/prompts';

const S_CORNER_TOP_LEFT = unicodeOr('╭', '+');
const S_CORNER_BOTTOM_LEFT = unicodeOr('╰', '+');

export function renderPrettyError(errorLines: Array<[key: string, value: unknown]>): string {
  return renderPrettyErrorGen(errorLines).toArray().join('\n');
}

function* renderPrettyErrorGen(
  errorLines: Array<[key: string, value: unknown]>
): Generator<string, void, unknown> {
  if (errorLines.length === 0) {
    yield '';
  } else if (errorLines.length <= 2) {
    for (const [key, value] of errorLines) {
      yield `${colors.gray(S_BAR)}  ${colors.blueBright(key)}: ${value}`;
    }
  } else if (errorLines.length > 2) {
    for (let i = 0; i < errorLines.length; i++) {
      const [key, value] = errorLines[i];

      if (i === 0) {
        yield `${colors.gray(`${S_CORNER_TOP_LEFT}${S_BAR_H}`)} ${colors.blueBright(key)}: ${value}`;
      } else if (i === errorLines.length - 1) {
        yield `${colors.gray(`${S_CORNER_BOTTOM_LEFT}${S_BAR_H}`)} ${colors.blueBright(key)}: ${value}`;
      } else {
        yield `${colors.gray(S_BAR)}  ${colors.blueBright(key)}: ${value}`;
      }
    }
  }
}
