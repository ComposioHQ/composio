import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';
import { NodeOs, resolveHomeDirectory } from 'src/services/node-os';

describe('NodeOs home directory resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    {
      name: 'macOS HOME',
      platform: 'darwin' as const,
      environment: { HOME: '/custom/mac-home', USER: 'alberto' },
      expected: '/custom/mac-home',
    },
    {
      name: 'Linux username',
      platform: 'linux' as const,
      environment: { LOGNAME: 'alberto' },
      expected: '/home/alberto',
    },
    {
      name: 'Linux root username',
      platform: 'linux' as const,
      environment: { USER: 'root' },
      expected: '/root',
    },
    {
      name: 'Windows USERPROFILE',
      platform: 'win32' as const,
      environment: { USERPROFILE: 'D:\\Profiles\\alberto', USERNAME: 'alberto' },
      expected: 'D:\\Profiles\\alberto',
    },
    {
      name: 'Windows HOMEDRIVE and HOMEPATH',
      platform: 'win32' as const,
      environment: { HOMEDRIVE: 'E:', HOMEPATH: '\\People\\alberto' },
      expected: 'E:\\People\\alberto',
    },
    {
      name: 'Windows username convention',
      platform: 'win32' as const,
      environment: { USERNAME: 'alberto', SYSTEMDRIVE: 'F:' },
      expected: 'F:\\Users\\alberto',
    },
  ])('resolves $name', ({ platform, environment, expected }) => {
    expect(
      resolveHomeDirectory({
        platform,
        environment,
        temporaryDirectory: '/tmp/fallback-home',
      })
    ).toBe(expected);
  });

  it('uses the temporary directory when no home or username can be resolved', () => {
    expect(
      resolveHomeDirectory({
        platform: 'linux',
        environment: {},
        temporaryDirectory: '/tmp/fallback-home',
      })
    ).toBe('/tmp/fallback-home');
  });

  it.runIf(process.platform === 'darwin')(
    'keeps HOME-less CLI state out of the current project on macOS',
    () => {
      const username = process.env.USER?.trim() || process.env.LOGNAME?.trim() || 'current-user';
      vi.stubEnv('HOME', '');
      vi.stubEnv('USERPROFILE', '');
      vi.stubEnv('HOMEDRIVE', '');
      vi.stubEnv('HOMEPATH', '');
      vi.stubEnv('USER', username);
      vi.stubEnv('LOGNAME', '');
      vi.stubEnv('USERNAME', '');

      const homedir = Effect.runSync(
        Effect.gen(function* () {
          return (yield* NodeOs).homedir;
        }).pipe(Effect.provide(NodeOs.Default))
      );

      expect(homedir).toBe(`/Users/${username}`);
      expect(homedir).not.toBe(process.cwd());
    }
  );
});
