import * as color from 'src/ui/colors';

export const formatTitle = (errorsCount: number): string[] => {
  if (errorsCount === 1) {
    return [''];
  }

  const libName = color.bold(`${color.underline(color.redBright('effect-errors'))}`);
  const title = color.bold(
    color.cyanBright(`${errorsCount} error${errorsCount > 1 ? 's' : ''} occurred`)
  );

  return ['', `❌ ${libName} ❌ ${title}`, '', ''];
};
