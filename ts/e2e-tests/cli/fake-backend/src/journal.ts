/**
 * The request journal: what the fake backend received, in arrival order, with
 * the identity each request carried resolved against the seeded world.
 */

import type { World } from './world';

/** Which first-party service a request was meant for, told apart by its path. */
export type ServiceRole =
  'backend' | 'dashboard' | 'agents' | 'github-api' | 'github-download' | 'posthog' | 'unknown';

/**
 * The kind of credential a request carried.
 *
 * - `user`: a user API key (`uk_`), from `x-user-api-key` or the Dashboard's bearer token.
 * - `project`: a project API key (`ak_`), from `x-api-key`.
 * - `agent`: a Composio agent key (`cak_`), sent to the agents service.
 * - `none`: no credential header at all.
 * - `unrecognized`: a credential whose prefix names none of the above.
 */
export type KeyClass = 'user' | 'project' | 'agent' | 'none' | 'unrecognized';

export interface JournalEntry {
  readonly seq: number;
  readonly role: ServiceRole;
  readonly method: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  /** The route that answered, e.g. `toolRouter.session.execute`; `null` when none matched. */
  readonly route: string | null;
  readonly keyClass: KeyClass;
  /** Whether the seeded world issued the credential. */
  readonly keyKnown: boolean;
  readonly orgId: string | null;
  /** The project the request acted on, as the seeded label (`consumer`, `developer`, …). */
  readonly project: string | null;
  /**
   * The project the request itself named, through its project key or its scope
   * headers; `null` when it named none. `project` can differ: a tool-router
   * session acts on the project it was created for, whatever the request says.
   */
  readonly requestedProject: string | null;
  /**
   * How the fake learned the project:
   * - `scope-headers`: `x-org-id` and `x-project-id` on a user-key request.
   * - `project-key`: the project API key that authenticated the request.
   * - `key-default`: a user key with no scope, falling back to the org's default project.
   * - `route`: the endpoint itself implies it (a consumer endpoint, a tool-router session).
   */
  readonly projectFrom: 'scope-headers' | 'project-key' | 'key-default' | 'route' | null;
  /** The user the request acted as, when the request names or implies one. */
  readonly userId: string | null;
  readonly body: unknown;
  readonly status: number;
  /** What the request changed in the world: a tool that ran, a connection that was started. */
  readonly effect: 'tool-executed' | 'connection-started' | null;
  /**
   * The tool that ran, for a `tool-executed` entry, whichever route ran it.
   * The three execute routes carry the slug and the arguments differently.
   */
  readonly tool: {
    readonly slug: string;
    readonly arguments: Readonly<Record<string, unknown>>;
  } | null;
  /** The injected fault that shaped the answer, if any. */
  readonly fault: string | null;
}

export interface RequestIdentity {
  readonly keyClass: KeyClass;
  readonly key: string | null;
  readonly keyKnown: boolean;
  readonly orgId: string | null;
  /** Label of the project named by `x-project-id` or owning the project key. */
  readonly project: string | null;
}

const classifyKey = (key: string): KeyClass => {
  if (key.startsWith('uk_') || key.startsWith('uak_')) return 'user';
  if (key.startsWith('ak_')) return 'project';
  if (key.startsWith('cak_')) return 'agent';
  return 'unrecognized';
};

const bearerToken = (headers: Headers): string | null => {
  const value = headers.get('authorization');
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1] ?? null;
};

/** Reads the credential and scope headers the CLI sends and resolves them against the world. */
export const identify = (headers: Headers, world: World): RequestIdentity => {
  const key = headers.get('x-user-api-key') ?? headers.get('x-api-key') ?? bearerToken(headers);
  const orgId = headers.get('x-org-id');
  const scopedProject = world.findProject(headers.get('x-project-id') ?? undefined);

  if (key === null) {
    return { keyClass: 'none', key, keyKnown: false, orgId, project: scopedProject?.label ?? null };
  }

  const keyClass = classifyKey(key);
  if (keyClass === 'project') {
    const project = world.projectForApiKey(key);
    return {
      keyClass,
      key,
      keyKnown: project !== undefined,
      orgId: orgId ?? project?.orgId ?? null,
      project: project?.label ?? null,
    };
  }

  return {
    keyClass,
    key,
    keyKnown: keyClass === 'user' && key === world.userApiKey,
    orgId,
    project: scopedProject?.label ?? null,
  };
};

export class Journal {
  private readonly log: JournalEntry[] = [];

  record(entry: Omit<JournalEntry, 'seq'>): JournalEntry {
    const recorded = { ...entry, seq: this.log.length + 1 };
    this.log.push(recorded);
    return recorded;
  }

  /** Every entry so far. */
  entries(): ReadonlyArray<JournalEntry> {
    return [...this.log];
  }

  /** A cursor for `since`, so a test can look at one command's requests only. */
  mark(): number {
    return this.log.length;
  }

  since(mark: number): ReadonlyArray<JournalEntry> {
    return this.log.slice(mark);
  }

  /** Entries answered by the named route. */
  route(route: string): ReadonlyArray<JournalEntry> {
    return this.log.filter(entry => entry.route === route);
  }

  clear(): void {
    this.log.length = 0;
  }
}

/** `METHOD /path` per entry: a compact form for assertions and failure output. */
export const summarize = (entries: ReadonlyArray<JournalEntry>): string[] =>
  entries.map(entry => `${entry.method} ${entry.path}`);
