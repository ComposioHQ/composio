/**
 * The person the agent works for.
 *
 * A login or an account authorization needs them: only the owner of an account
 * can approve access to it, in a browser. So a journey has to model what
 * reaches them, or an agent that never showed them the URL would pass.
 *
 * Two things reach this person:
 *
 * - a page the CLI opens in their browser, and
 * - what the agent writes to them.
 *
 * They do not read the output of the agent's commands. The CLI assumes the
 * same: off a terminal `composio login` prints "For agents: Show the URL above
 * to the user".
 *
 * They approve every authorization that reaches them, and when the agent has
 * stopped to wait for that approval they say so.
 */

import type { World } from '@e2e-tests/cli-fake-backend';

export const PERSON_REPLY = 'Done, I approved it in my browser. Please continue.';

/** Where the CLI looks for a browser on Linux. */
export const BROWSER_PATH = '/usr/local/bin/xdg-open';

/**
 * The person's browser. It loads the page it is asked to open, and on the fake
 * backend loading an authorization page approves it. A page behind TLS is left
 * alone: bash has no TLS, and the CLI opens no such page off a terminal.
 */
export const BROWSER_SCRIPT = `#!/bin/bash
url="$1"
case "$url" in http://*) ;; *) exit 0 ;; esac
rest="\${url#http://}"
authority="\${rest%%/*}"
exec 3<>"/dev/tcp/\${authority%%:*}/\${authority##*:}" || exit 0
printf 'GET /%s HTTP/1.0\\r\\nHost: %s\\r\\n\\r\\n' "\${rest#*/}" "$authority" >&3
cat <&3 >/dev/null
`;

export interface Person {
  /**
   * Hands the person a message from the agent. `waiting` is true when the
   * agent has stopped and expects them to act; their reply, if they have one,
   * is returned.
   */
  hear(message: string, waiting: boolean): string | undefined;
}

export const personFor = (world: World): Person => ({
  hear: (message, waiting) => {
    let approved = false;
    for (const session of world.loginSessions) {
      if (session.status === 'pending' && message.includes(session.id)) {
        world.linkLoginSession(session.id);
        approved = true;
      }
    }
    for (const connection of world.connections) {
      if (connection.status === 'INITIATED' && message.includes(`/s/${connection.id}`)) {
        approved = world.authorizeConnection(connection.id) || approved;
      }
    }
    return waiting && approved ? PERSON_REPLY : undefined;
  },
});
