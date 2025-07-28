import color from 'picocolors';

export const {
  bold,
  underline,
  bgWhite,
  bgBlack,
  bgRed,
  gray,
  red,
  redBright,
  white,
  blue,
  cyanBright,
} = color.createColors(!Boolean(process.env.NO_COLOR));
