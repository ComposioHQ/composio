import { Effect } from 'effect';

type Environment = Readonly<Record<string, string | undefined>>;

type PlatformResolutionOptions = {
  readonly environment?: Environment;
  readonly platform?: NodeJS.Platform;
};

const nonEmptyEnvironmentValue = (environment: Environment, name: string): string | undefined => {
  const value = environment[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};

const resolveTemporaryDirectory = ({
  environment = process.env,
  platform = process.platform,
}: PlatformResolutionOptions = {}): string => {
  const candidates = platform === 'win32' ? ['TEMP', 'TMP'] : ['TMPDIR', 'TMP', 'TEMP'];
  for (const candidate of candidates) {
    const value = nonEmptyEnvironmentValue(environment, candidate);
    if (value !== undefined) return value;
  }

  if (platform !== 'win32') return '/tmp';

  const systemRoot =
    nonEmptyEnvironmentValue(environment, 'SYSTEMROOT') ??
    nonEmptyEnvironmentValue(environment, 'WINDIR') ??
    'C:\\Windows';
  return `${systemRoot.replace(/[\\/]+$/, '')}\\temp`;
};

export const resolveHomeDirectory = ({
  environment = process.env,
  platform = process.platform,
  temporaryDirectory = resolveTemporaryDirectory({ environment, platform }),
}: PlatformResolutionOptions & { readonly temporaryDirectory?: string } = {}): string => {
  const home = nonEmptyEnvironmentValue(environment, 'HOME');
  const userProfile = nonEmptyEnvironmentValue(environment, 'USERPROFILE');
  const environmentHome = platform === 'win32' ? (userProfile ?? home) : (home ?? userProfile);
  if (environmentHome !== undefined) return environmentHome;

  const homeDrive = nonEmptyEnvironmentValue(environment, 'HOMEDRIVE');
  const homePath = nonEmptyEnvironmentValue(environment, 'HOMEPATH');
  if (homeDrive !== undefined && homePath !== undefined) return `${homeDrive}${homePath}`;

  const username =
    platform === 'win32'
      ? (nonEmptyEnvironmentValue(environment, 'USERNAME') ??
        nonEmptyEnvironmentValue(environment, 'USER') ??
        nonEmptyEnvironmentValue(environment, 'LOGNAME'))
      : (nonEmptyEnvironmentValue(environment, 'USER') ??
        nonEmptyEnvironmentValue(environment, 'LOGNAME') ??
        nonEmptyEnvironmentValue(environment, 'USERNAME'));
  if (username !== undefined) {
    if (platform === 'darwin') return `/Users/${username}`;
    if (platform === 'linux' && username === 'root') return '/root';
    if (platform !== 'win32') return `/home/${username}`;

    const systemDrive = nonEmptyEnvironmentValue(environment, 'SYSTEMDRIVE') ?? homeDrive ?? 'C:';
    return `${systemDrive.replace(/[\\/]+$/, '')}\\Users\\${username}`;
  }

  return temporaryDirectory;
};

// Injectable operating-system details for testing purposes.
export class NodeOs extends Effect.Service<NodeOs>()('services/NodeOs', {
  sync: () => {
    const environment = process.env;
    const platform = process.platform;
    const tmpdir = resolveTemporaryDirectory({ environment, platform });
    return {
      homedir: resolveHomeDirectory({ environment, platform, temporaryDirectory: tmpdir }),
      tmpdir,
      platform,
      arch: process.arch,
    };
  },
  dependencies: [],
}) {}

export const defaultNodeOs = ({
  homedir,
  tmpdir = resolveTemporaryDirectory(),
}: {
  homedir: string;
  tmpdir?: string;
}) => new NodeOs({ homedir, tmpdir, platform: process.platform, arch: process.arch });
