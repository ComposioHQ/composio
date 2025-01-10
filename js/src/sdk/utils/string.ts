export const removeTrailingSlashIfExists = (str: string) =>
  str.replace(/\/+$/, "");
