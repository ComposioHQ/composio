export function getArgs(args: string[] = []) {
  const keys = args;

  const value = process.argv.slice(3);

  return keys.reduce(
    (acc, key, index) => {
      acc[key] = value[index];
      return acc;
    },
    {} as Record<string, string | undefined>,
  );
}

export function parseDate(date: string) {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}
