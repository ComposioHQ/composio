import { describe, it, expect } from 'vitest';
import { getJsInstallCommand, getPythonInstallCommand } from 'src/effects/core-dependency';

describe('core-dependency', () => {
  describe('getJsInstallCommand', () => {
    it('[Given] pnpm [Then] returns "pnpm add <dep>"', () => {
      expect(getJsInstallCommand('pnpm', '@composio/core')).toBe('pnpm add @composio/core');
    });

    it('[Given] npm [Then] returns "npm install -S <dep>"', () => {
      expect(getJsInstallCommand('npm', '@composio/core')).toBe('npm install -S @composio/core');
    });

    it('[Given] yarn [Then] returns "yarn add <dep>"', () => {
      expect(getJsInstallCommand('yarn', '@composio/core')).toBe('yarn add @composio/core');
    });

    it('[Given] bun [Then] returns "bun add <dep>"', () => {
      expect(getJsInstallCommand('bun', '@composio/core')).toBe('bun add @composio/core');
    });

    it('[Given] deno [Then] returns "deno add npm:<dep>"', () => {
      expect(getJsInstallCommand('deno', '@composio/core')).toBe('deno add npm:@composio/core');
    });
  });

  describe('getPythonInstallCommand', () => {
    it('[Given] uv [Then] returns "uv pip install <dep>"', () => {
      expect(getPythonInstallCommand('uv', 'composio')).toBe('uv pip install composio');
    });

    it('[Given] pip [Then] returns "pip install <dep>"', () => {
      expect(getPythonInstallCommand('pip', 'composio')).toBe('pip install composio');
    });
  });
});
