import type { LocalCliPlatform } from './types';

export interface DetectPlatformInput {
  readonly platform?: NodeJS.Platform;
  readonly arch?: NodeJS.Architecture | string;
}

export const detectCliPlatform = (input: DetectPlatformInput = {}): LocalCliPlatform => {
  const platform = input.platform ?? process.platform;
  const arch = input.arch ?? process.arch;
  if (platform === 'darwin') {
    return arch === 'x64' ? 'darwin-x64' : 'darwin-arm64';
  }
  if (platform === 'linux') {
    return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  }
  if (platform === 'win32') {
    return arch === 'arm64' ? 'win32-arm64' : 'win32-x64';
  }
  return 'all';
};

const platformFamily = (platform: LocalCliPlatform): LocalCliPlatform => {
  if (platform.startsWith('darwin')) return 'darwin';
  if (platform.startsWith('linux')) return 'linux';
  if (platform.startsWith('win32')) return 'win32';
  return platform;
};

export const supportsCliPlatform = (
  supportedPlatforms: ReadonlyArray<LocalCliPlatform>,
  currentPlatform: LocalCliPlatform = detectCliPlatform()
): boolean => {
  if (supportedPlatforms.includes('all')) return true;
  if (supportedPlatforms.includes(currentPlatform)) return true;
  return supportedPlatforms.includes(platformFamily(currentPlatform));
};

export const formatSupportedPlatforms = (platforms: ReadonlyArray<LocalCliPlatform>): string =>
  platforms.includes('all') ? 'all CLI platforms' : platforms.join(', ');
