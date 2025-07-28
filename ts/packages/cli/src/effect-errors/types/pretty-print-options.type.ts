export interface PrettyPrintOptions {
  enabled?: boolean;
  stripCwd?: boolean | undefined;
  hideStackTrace?: boolean;
}

export const prettyPrintOptionsDefault: PrettyPrintOptions = {
  enabled: true,
  stripCwd: true,
  hideStackTrace: true,
};
