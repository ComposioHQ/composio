import { Effect } from 'effect';
import process from 'node:process';
import childProcess from 'node:child_process';

/**
 * Open a URL in the user's default browser.
 *
 * Uses the platform-native command (`open` on macOS, `xdg-open` on Linux,
 * `start` on Windows) via `child_process.spawn` instead of the `open` npm
 * package. The npm package's `apps.browser` / `apps.browserPrivate` code
 * path maintains an allow-list of recognized browser bundle IDs and throws
 * "Error: <name> is not supported as a default browser" for any browser
 * not in that list (e.g. Brave in versions before `open@10.2.0`).
 *
 * By calling the OS command directly we avoid browser detection entirely —
 * the OS routes the URL to whatever the user has configured as default,
 * regardless of browser vendor.
 *
 * @see https://github.com/ComposioHQ/composio/issues/2542
 */
export const openUrl = (url: string): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        const { platform } = process;
        let command: string;
        let args: string[];

        if (platform === 'darwin') {
          command = 'open';
          args = [url];
        } else if (platform === 'win32') {
          command = 'cmd';
          args = ['/c', 'start', '', url];
        } else {
          // Linux and other Unix-like systems
          command = 'xdg-open';
          args = [url];
        }

        const child = childProcess.spawn(command, args, {
          stdio: 'ignore',
          detached: true,
        });

        child.on('error', reject);

        // For fire-and-forget, resolve once spawned successfully.
        // The 'spawn' event fires when the child process has been created.
        child.on('spawn', () => {
          child.unref();
          resolve();
        });
      }),
    catch: error =>
      new Error(
        `Failed to open URL in browser: ${error instanceof Error ? error.message : String(error)}`
      ),
  });
