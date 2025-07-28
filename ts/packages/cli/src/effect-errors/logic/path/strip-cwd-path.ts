const cwdRegex = global.process !== undefined ? new RegExp(global.process.cwd(), 'g') : null;

export const stripCwdPath = (path: string): string =>
  cwdRegex === null ? path : path.replace(cwdRegex, '.');
