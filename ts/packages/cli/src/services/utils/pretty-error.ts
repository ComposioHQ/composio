import { Formatter } from 'effect';
import colors from 'picocolors';
import { S_BAR, S_BAR_H, unicodeOr } from '@clack/prompts';

const S_CORNER_TOP_LEFT = unicodeOr('╭', '+');
const S_CORNER_BOTTOM_LEFT = unicodeOr('╰', '+');

export function renderPrettyError(errorLines: Array<[key: string, value: unknown]>): string {
  const showCorners = errorLines.length > 2;
  return errorLines
    .map(([key, value], index) => {
      const text = typeof value === 'string' ? value : Formatter.format(value);
      let prefix = `${colors.inverse(S_BAR)}  `;
      if (showCorners && index === 0) {
        prefix = `${colors.inverse(`${S_CORNER_TOP_LEFT}${S_BAR_H}`)} `;
      } else if (showCorners && index === errorLines.length - 1) {
        prefix = `${colors.inverse(`${S_CORNER_BOTTOM_LEFT}${S_BAR_H}`)} `;
      }
      return `${prefix}${colors.blueBright(key)}: ${text}`;
    })
    .join('\n');
}
