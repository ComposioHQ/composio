import color from 'picocolors';
import { Effect } from 'effect';
import { HOST_CONFIG } from 'src/config';

const colorsEnabled = !Effect.runSync(HOST_CONFIG.NO_COLOR);

export const {
  bold,
  underline,
  bgWhite,
  bgBlack,
  bgRed,
  gray,
  dim,
  green,
  red,
  redBright,
  white,
  blue,
  cyanBright,
} = color.createColors(colorsEnabled);
