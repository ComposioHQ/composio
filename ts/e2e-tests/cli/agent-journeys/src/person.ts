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
 * They approve an authorization when the page for it reaches them: the CLI
 * opened it, or the agent wrote its complete URL. An id on its own, or the
 * path under some other host, is not a page they can open. A URL written
 * without its scheme is not recognised either; that is a limit of this model,
 * not a claim about people.
 *
 * When the agent has stopped to wait, they say that they approved, once per
 * approval, and only while the CLI has not been told: an agent whose own
 * command already saw the login or the connection has nothing to wait for.
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

/** The origins of the fake, as the agent sees them in command output. */
export interface PersonUrls {
  /** Where the login page lives: `<dashboard>?cliKey=<login session id>`. */
  readonly dashboard: string;
  /** Where an authorization page lives: `<backend>/api/v3/s/<connection id>`. */
  readonly backend: string;
}

const AUTHORIZATION_PATH = /^\/api\/v\d+(?:\.\d+)?\/s\/([^/]+)$/;

/** The complete URLs in a message, without the punctuation or markup around them. */
const urlsIn = (message: string): URL[] =>
  (message.match(/https?:\/\/[^\s<>"'`)\]]+/g) ?? []).flatMap(candidate => {
    const text = candidate.replace(/[.,;:!?*_]+$/, '');
    return URL.canParse(text) ? [new URL(text)] : [];
  });

export const personFor = (world: World, urls: PersonUrls): Person => {
  const dashboard = new URL(urls.dashboard).origin;
  const backend = new URL(urls.backend).origin;
  const acknowledged = new Set<string>();

  return {
    hear: (message, waiting) => {
      for (const url of urlsIn(message)) {
        const loginId =
          url.origin === dashboard && url.pathname === '/' ? url.searchParams.get('cliKey') : null;
        if (
          loginId !== null &&
          world.loginSessions.some(
            session => session.id === loginId && session.status === 'pending'
          )
        ) {
          world.linkLoginSession(loginId);
        }
        const connectionId =
          url.origin === backend ? AUTHORIZATION_PATH.exec(url.pathname)?.[1] : undefined;
        if (connectionId !== undefined) world.authorizeConnection(connectionId);
      }
      if (!waiting) return undefined;
      const news = world.unreportedApprovals().filter(id => !acknowledged.has(id));
      for (const id of news) acknowledged.add(id);
      return news.length > 0 ? PERSON_REPLY : undefined;
    },
  };
};
