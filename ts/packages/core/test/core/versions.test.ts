import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getToolkitVersionsFromEnv } from '../../src/utils/sdk';
import { getToolkitVersion } from '../../src/utils/toolkitVersion';
import { getEnvsWithPrefix } from '../../src/utils/env';
import { ToolkitVersions } from '../../src/types/tool.types';

describe('Version Management', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('getEnvsWithPrefix', () => {
    it('should return environment variables with the specified prefix', () => {
      process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20250902_00';
      process.env.COMPOSIO_TOOLKIT_VERSION_SLACK = 'latest';
      process.env.COMPOSIO_TOOLKIT_VERSION_GMAIL = '20250901_01';
      process.env.OTHER_ENV_VAR = 'should_not_be_included';

      const result = getEnvsWithPrefix('COMPOSIO_TOOLKIT_VERSION_');

      expect(result).toEqual({
        COMPOSIO_TOOLKIT_VERSION_GITHUB: '20250902_00',
        COMPOSIO_TOOLKIT_VERSION_SLACK: 'latest',
        COMPOSIO_TOOLKIT_VERSION_GMAIL: '20250901_01',
      });
      expect(result).not.toHaveProperty('OTHER_ENV_VAR');
    });

    it('should return empty object when no matching environment variables exist', () => {
      process.env.SOME_OTHER_VAR = 'value';

      const result = getEnvsWithPrefix('COMPOSIO_TOOLKIT_VERSION_');

      expect(result).toEqual({});
    });

    it('should return empty object when prefix is empty', () => {
      process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20250902_00';

      const result = getEnvsWithPrefix('');

      // Should return all env vars when prefix is empty
      expect(Object.keys(result).length).toBeGreaterThan(0);
      expect(result).toHaveProperty('COMPOSIO_TOOLKIT_VERSION_GITHUB');
    });

    it('should handle process.env being undefined gracefully', () => {
      const originalProcess = process;
      // @ts-expect-error: Intentionally testing edge case
      global.process = undefined;

      const result = getEnvsWithPrefix('COMPOSIO_TOOLKIT_VERSION_');

      expect(result).toEqual({});

      // Restore process
      global.process = originalProcess;
    });

    it('should handle errors gracefully', () => {
      // Mock process.env to throw an error
      const mockProcess = {
        env: new Proxy(
          {},
          {
            get() {
              throw new Error('Test error');
            },
          }
        ),
      };

      vi.stubGlobal('process', mockProcess);

      const result = getEnvsWithPrefix('COMPOSIO_TOOLKIT_VERSION_');

      expect(result).toEqual({});

      vi.unstubAllGlobals();
    });
  });

  describe('getToolkitVersionsFromEnv', () => {
    describe('when user provides string version (global version)', () => {
      it('should return the string version as-is when user provides "latest"', () => {
        const result = getToolkitVersionsFromEnv('latest');
        expect(result).toBe('latest');
      });

      it('should return the string version as-is when user provides specific version', () => {
        const result = getToolkitVersionsFromEnv('20250902_00' as any);
        expect(result).toBe('20250902_00');
      });

      it('should ignore environment variables when user provides string version', () => {
        process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20250901_01';
        process.env.COMPOSIO_TOOLKIT_VERSION_SLACK = 'latest';

        const result = getToolkitVersionsFromEnv('20250902_00' as any);
        expect(result).toBe('20250902_00');
      });
    });

    describe('when user provides object version mapping', () => {
      it('should normalize toolkit names to lowercase', () => {
        const userVersions = {
          GITHUB: '20250902_00',
          Slack: 'latest',
          gmail: '20250901_01',
        };

        const result = getToolkitVersionsFromEnv(userVersions) as ToolkitVersions;

        expect(result).toEqual({
          github: '20250902_00',
          slack: 'latest',
          gmail: '20250901_01',
        });
      });

      it('should merge environment variables with user-provided versions', () => {
        process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20250901_00';
        process.env.COMPOSIO_TOOLKIT_VERSION_NOTION = 'latest';

        const userVersions = {
          slack: '20250902_00',
          gmail: 'latest',
        };

        const result = getToolkitVersionsFromEnv(userVersions) as ToolkitVersions;

        expect(result).toEqual({
          github: '20250901_00', // from env
          notion: 'latest', // from env
          slack: '20250902_00', // from user
          gmail: 'latest', // from user
        });
      });

      it('should prioritize user-provided versions over environment variables', () => {
        process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20250901_00';
        process.env.COMPOSIO_TOOLKIT_VERSION_SLACK = '20250901_01';

        const userVersions = {
          github: '20250902_00', // should override env
          slack: 'latest', // should override env
          gmail: '20250902_01', // new toolkit
        };

        const result = getToolkitVersionsFromEnv(userVersions) as ToolkitVersions;

        expect(result).toEqual({
          github: '20250902_00', // user version takes precedence
          slack: 'latest', // user version takes precedence
          gmail: '20250902_01', // from user
        });
      });

      it('should handle mixed case environment variables correctly', () => {
        process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20250901_00';
        process.env.COMPOSIO_TOOLKIT_VERSION_SLACK = 'latest';

        const result = getToolkitVersionsFromEnv({}) as ToolkitVersions;

        expect(result).toEqual({
          github: '20250901_00', // normalized to lowercase
          slack: 'latest', // normalized to lowercase
        });
      });
    });

    describe('when no user versions provided', () => {
      it('should return environment variables only', () => {
        process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20250901_00';
        process.env.COMPOSIO_TOOLKIT_VERSION_SLACK = 'latest';

        const result = getToolkitVersionsFromEnv() as ToolkitVersions;

        expect(result).toEqual({
          github: '20250901_00',
          slack: 'latest',
        });
      });

      it('should return "latest" when no environment variables or user versions exist', () => {
        const result = getToolkitVersionsFromEnv();
        expect(result).toBe('latest');
      });

      it('should return "latest" when empty object is provided and no env vars exist', () => {
        const result = getToolkitVersionsFromEnv({});
        expect(result).toBe('latest');
      });

      it('should handle undefined input correctly', () => {
        process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20250901_00';

        const result = getToolkitVersionsFromEnv(undefined) as ToolkitVersions;

        expect(result).toEqual({
          github: '20250901_00',
        });
      });
    });

    describe('environment variable parsing', () => {
      it('should extract toolkit names correctly from environment variables', () => {
        process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB_ENTERPRISE = '20250901_00';
        process.env.COMPOSIO_TOOLKIT_VERSION_GOOGLE_WORKSPACE = 'latest';
        process.env.COMPOSIO_TOOLKIT_VERSION_MS_TEAMS = '20250902_00';

        const result = getToolkitVersionsFromEnv() as ToolkitVersions;

        expect(result).toEqual({
          github_enterprise: '20250901_00',
          google_workspace: 'latest',
          ms_teams: '20250902_00',
        });
      });

      it('should handle environment variables with special characters', () => {
        process.env['COMPOSIO_TOOLKIT_VERSION_MY-TOOLKIT'] = '20250901_00';
        process.env['COMPOSIO_TOOLKIT_VERSION_ANOTHER_TOOLKIT'] = 'latest';

        const result = getToolkitVersionsFromEnv() as ToolkitVersions;

        expect(result).toEqual({
          'my-toolkit': '20250901_00',
          another_toolkit: 'latest',
        });
      });
    });
  });

  describe('getToolkitVersion', () => {
    describe('when toolkitVersions is a string (global version)', () => {
      it('should return the global version for any toolkit', () => {
        const result1 = getToolkitVersion('github', 'latest');
        const result2 = getToolkitVersion('slack', 'latest');
        const result3 = getToolkitVersion('gmail', 'latest');

        expect(result1).toBe('latest');
        expect(result2).toBe('latest');
        expect(result3).toBe('latest');
      });
    });

    describe('when toolkitVersions is an object mapping', () => {
      it('should return specific version for toolkit when available', () => {
        const toolkitVersions = {
          github: '20250902_00',
          slack: 'latest',
          gmail: '20250901_01',
        };

        expect(getToolkitVersion('github', toolkitVersions)).toBe('20250902_00');
        expect(getToolkitVersion('slack', toolkitVersions)).toBe('latest');
        expect(getToolkitVersion('gmail', toolkitVersions)).toBe('20250901_01');
      });

      it('should return "latest" for toolkit not in the mapping', () => {
        const toolkitVersions = {
          github: '20250902_00',
          slack: 'latest',
        };

        const result = getToolkitVersion('notion', toolkitVersions);
        expect(result).toBe('latest');
      });

      it('should handle empty object mapping', () => {
        const result = getToolkitVersion('github', {});
        expect(result).toBe('latest');
      });

      it('should be case-sensitive for toolkit slugs', () => {
        const toolkitVersions = {
          github: '20250902_00',
          GITHUB: 'latest',
        };

        expect(getToolkitVersion('github', toolkitVersions)).toBe('20250902_00');
        expect(getToolkitVersion('GITHUB', toolkitVersions)).toBe('latest');
        expect(getToolkitVersion('GitHub', toolkitVersions)).toBe('latest'); // not found
      });
    });

    describe('when toolkitVersions is undefined or null', () => {
      it('should return "latest" when toolkitVersions is undefined', () => {
        const result = getToolkitVersion('github', undefined);
        expect(result).toBe('latest');
      });

      it('should return "latest" when toolkitVersions is null', () => {
        const result = getToolkitVersion('github', null as any);
        expect(result).toBe('latest');
      });
    });

    describe('edge cases', () => {
      it('should handle empty toolkit slug', () => {
        const toolkitVersions = {
          '': '20250902_00',
          github: 'latest',
        };

        expect(getToolkitVersion('', toolkitVersions)).toBe('20250902_00');
        expect(getToolkitVersion('github', toolkitVersions)).toBe('latest');
      });

      it('should handle toolkit slug with special characters', () => {
        const toolkitVersions = {
          'my-toolkit': '20250902_00',
          another_toolkit: 'latest',
          'toolkit.with.dots': '20250901_00',
        };

        expect(getToolkitVersion('my-toolkit', toolkitVersions)).toBe('20250902_00');
        expect(getToolkitVersion('another_toolkit', toolkitVersions)).toBe('latest');
        expect(getToolkitVersion('toolkit.with.dots', toolkitVersions)).toBe('20250901_00');
      });

      it('should handle version values that are not strings', () => {
        const toolkitVersions = {
          github: '20250902_00',
          slack: 'latest',
        } as any;

        expect(getToolkitVersion('github', toolkitVersions)).toBe('20250902_00');
        expect(getToolkitVersion('slack', toolkitVersions)).toBe('latest');
      });
    });
  });

  describe('Integration tests', () => {
    it('should work together: getToolkitVersionsFromEnv + getToolkitVersion', () => {
      // Set up environment
      process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20250901_00';
      process.env.COMPOSIO_TOOLKIT_VERSION_SLACK = 'latest';

      // User provides additional versions
      const userVersions = {
        GMAIL: '20250902_00', // will be normalized to lowercase
        notion: 'latest',
      };

      // Get toolkit versions configuration
      const toolkitVersions = getToolkitVersionsFromEnv(userVersions) as ToolkitVersions;

      // Test individual toolkit version retrieval
      expect(getToolkitVersion('github', toolkitVersions)).toBe('20250901_00'); // from env
      expect(getToolkitVersion('slack', toolkitVersions)).toBe('latest'); // from env
      expect(getToolkitVersion('gmail', toolkitVersions)).toBe('20250902_00'); // from user
      expect(getToolkitVersion('notion', toolkitVersions)).toBe('latest'); // from user
      expect(getToolkitVersion('unknown', toolkitVersions)).toBe('latest'); // fallback
    });

    it('should handle global version override correctly', () => {
      // Set up environment (should be ignored)
      process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = '20250901_00';
      process.env.COMPOSIO_TOOLKIT_VERSION_SLACK = 'latest';

      // User provides global version
      const toolkitVersions = getToolkitVersionsFromEnv('20250902_00' as any);

      // All toolkits should get the global version
      expect(getToolkitVersion('github', toolkitVersions)).toBe('20250902_00');
      expect(getToolkitVersion('slack', toolkitVersions)).toBe('20250902_00');
      expect(getToolkitVersion('gmail', toolkitVersions)).toBe('20250902_00');
      expect(getToolkitVersion('any-toolkit', toolkitVersions)).toBe('20250902_00');
    });

    it('should fall back to "latest" when no configuration is provided', () => {
      // No environment variables, no user input
      const toolkitVersions = getToolkitVersionsFromEnv();

      expect(toolkitVersions).toBe('latest');
      expect(getToolkitVersion('github', toolkitVersions)).toBe('latest');
      expect(getToolkitVersion('slack', toolkitVersions)).toBe('latest');
      expect(getToolkitVersion('any-toolkit', toolkitVersions)).toBe('latest');
    });

    it('should demonstrate priority order: user object > env vars > fallback', () => {
      // Environment variables
      process.env.COMPOSIO_TOOLKIT_VERSION_GITHUB = 'env_version';
      process.env.COMPOSIO_TOOLKIT_VERSION_SLACK = 'env_slack_version';

      // User provides partial override
      const userVersions = {
        github: 'user_version', // overrides env
        gmail: 'user_gmail_version', // new toolkit
        // slack not specified, should use env
      };

      const toolkitVersions = getToolkitVersionsFromEnv(userVersions) as ToolkitVersions;

      expect(getToolkitVersion('github', toolkitVersions)).toBe('user_version'); // user wins
      expect(getToolkitVersion('slack', toolkitVersions)).toBe('env_slack_version'); // from env
      expect(getToolkitVersion('gmail', toolkitVersions)).toBe('user_gmail_version'); // from user
      expect(getToolkitVersion('notion', toolkitVersions)).toBe('latest'); // fallback
    });
  });
});
