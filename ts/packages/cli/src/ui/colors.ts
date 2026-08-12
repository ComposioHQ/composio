import color from 'picocolors';

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
  // eslint-disable-next-line eslint-js/no-restricted-syntax -- palette is created eagerly at import time, before any Effect runtime; honors the NO_COLOR convention
} = color.createColors(!Boolean(process.env.NO_COLOR));
