export function missingReleaseNotes(
  changedPaths: string[],
  changesets: { id?: string; releases: { name: string; type: string }[] }[],
  packages: { name: string; directory: string; private?: boolean }[],
  exemption?: string
): string[];
export function validateChangesets(cwd?: string, base?: string): Promise<void>;
export function findIgnoredChangesetReleases(
  status: { changesets?: { id: string; releases?: { name: string }[] }[] },
  ignoredPackages: string[]
): { changeset: string; package: string }[];
