import { Effect } from 'effect';

const nonEmptyEnvironmentValue = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};

const resolveHomeDirectory = (): string => {
  const home = nonEmptyEnvironmentValue('HOME');
  const userProfile = nonEmptyEnvironmentValue('USERPROFILE');
  const environmentHome =
    process.platform === 'win32' ? (userProfile ?? home) : (home ?? userProfile);
  if (environmentHome !== undefined) return environmentHome;

  const homeDrive = nonEmptyEnvironmentValue('HOMEDRIVE');
  const homePath = nonEmptyEnvironmentValue('HOMEPATH');
  if (homeDrive !== undefined && homePath !== undefined) return `${homeDrive}${homePath}`;

  return process.cwd();
};

const resolveTemporaryDirectory = (): string => {
  const candidates = process.platform === 'win32' ? ['TEMP', 'TMP'] : ['TMPDIR', 'TMP', 'TEMP'];
  for (const candidate of candidates) {
    const value = nonEmptyEnvironmentValue(candidate);
    if (value !== undefined) return value;
  }

  if (process.platform !== 'win32') return '/tmp';

  const systemRoot =
    nonEmptyEnvironmentValue('SYSTEMROOT') ?? nonEmptyEnvironmentValue('WINDIR') ?? 'C:\\Windows';
  return `${systemRoot.replace(/[\\/]+$/, '')}\\temp`;
};

// Injectable operating-system details for testing purposes.
export class NodeOs extends Effect.Service<NodeOs>()('services/NodeOs', {
  sync: () => ({
    homedir: resolveHomeDirectory(),
    tmpdir: resolveTemporaryDirectory(),
    platform: process.platform,
    arch: process.arch,
  }),
  dependencies: [],
}) {}

export const defaultNodeOs = ({
  homedir,
  tmpdir = resolveTemporaryDirectory(),
}: {
  homedir: string;
  tmpdir?: string;
}) => new NodeOs({ homedir, tmpdir, platform: process.platform, arch: process.arch });
