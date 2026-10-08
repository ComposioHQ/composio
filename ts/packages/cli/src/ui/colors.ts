import color from 'picocolors';
import { Effect } from 'effect';
import { UNPREFIXED_CONFIG } from 'src/effects/app-config';
import { loadHostConfig } from 'src/services/config';

const colorsEnabled = !Effect.runSync(loadHostConfig(UNPREFIXED_CONFIG.NO_COLOR));

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
