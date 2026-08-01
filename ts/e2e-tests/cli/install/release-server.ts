import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INSTALL_E2E_LOCAL_RELEASE_TAG } from '@e2e-tests/utils/const';

const ARCHIVE_BY_ARCH = {
  arm64: 'composio-linux-aarch64.zip',
  x64: 'composio-linux-x64.zip',
} as const;

export interface InstallReleaseServer {
  baseUrl: string;
  platform: 'linux/amd64' | 'linux/arm64';
  stop: () => void;
}

export function startInstallReleaseServer(options: {
  repoRoot: string;
  releaseDir: string;
}): InstallReleaseServer {
  const preferredArch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const archiveName = ARCHIVE_BY_ARCH[preferredArch];
  const archivePath = join(options.releaseDir, archiveName);
  const checksumsPath = join(options.releaseDir, 'checksums.txt');
  if (!existsSync(archivePath) || !existsSync(checksumsPath)) {
    throw new Error(
      `Local install fixture must contain ${archiveName} and checksums.txt: ${options.releaseDir}`
    );
  }

  const scripts = new Map([
    ['/install', join(options.repoRoot, 'install.sh')],
    ['/install/bash', join(options.repoRoot, 'install/bash.sh')],
    ['/install/zsh', join(options.repoRoot, 'install/zsh.sh')],
    ['/install/fish', join(options.repoRoot, 'install/fish.sh')],
  ]);

  let dockerBaseUrl = '';
  const server = Bun.serve({
    hostname: '0.0.0.0',
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const scriptPath = scripts.get(url.pathname);
      if (scriptPath) {
        return new Response(Bun.file(scriptPath), {
          headers: { 'content-type': 'text/x-shellscript; charset=utf-8' },
        });
      }

      if (/^\/repos\/[^/]+\/[^/]+\/releases$/.test(url.pathname)) {
        return Response.json([
          {
            tag_name: INSTALL_E2E_LOCAL_RELEASE_TAG,
            draft: false,
            prerelease: false,
            assets: [
              {
                name: archiveName,
                browser_download_url: `${dockerBaseUrl}/ComposioHQ/composio/releases/download/${encodeURIComponent(INSTALL_E2E_LOCAL_RELEASE_TAG)}/${archiveName}`,
              },
            ],
          },
        ]);
      }

      if (url.pathname.includes('/releases/download/') && url.pathname.endsWith(archiveName)) {
        if (url.pathname.startsWith('/corrupt/')) {
          return new Response('not a zip archive\n', {
            headers: { 'content-type': 'application/zip' },
          });
        }
        return new Response(Bun.file(archivePath), {
          headers: { 'content-type': 'application/zip' },
        });
      }

      if (url.pathname.includes('/releases/download/') && url.pathname.endsWith('checksums.txt')) {
        return new Response(readFileSync(checksumsPath), {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }

      return new Response('not found\n', { status: 404 });
    },
  });

  dockerBaseUrl = `http://host.docker.internal:${server.port}`;
  return {
    baseUrl: dockerBaseUrl,
    platform: preferredArch === 'arm64' ? 'linux/arm64' : 'linux/amd64',
    stop: () => server.stop(true),
  };
}
