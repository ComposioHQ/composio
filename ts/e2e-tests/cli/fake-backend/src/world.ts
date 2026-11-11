/**
 * The seeded state of the fake Composio deployment.
 *
 * Everything a response can echo back (ids, timestamps, emails) is fixed here,
 * so two runs of the same journey print the same bytes.
 */

/** The one instant every seeded `created_at`/`updated_at` reports. */
export const SEEDED_AT = '2026-01-01T00:00:00.000Z';

/** Far enough ahead that a seeded login session never expires during a run. */
export const SEEDED_EXPIRY = '2099-01-01T00:00:00.000Z';

export interface SeededOrg {
  readonly id: string;
  readonly name: string;
  readonly plan: string;
}

export interface SeededMember {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
}

export type ProjectKind = 'consumer' | 'developer';

export interface SeededProject {
  /** What the journal calls this project, so assertions never repeat an id. */
  readonly label: string;
  readonly kind: ProjectKind;
  readonly autoId: number;
  readonly uuid: string;
  readonly nanoId: string;
  readonly name: string;
  readonly orgId: string;
  /** Project API key (`ak_`), minted for the developer project by `dev init`. */
  readonly apiKey: string;
}

export interface SeededToolkit {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly noAuth: boolean;
  readonly version: string;
}

export interface SeededTool {
  readonly slug: string;
  readonly name: string;
  readonly toolkit: string;
  readonly description: string;
  readonly inputParameters: Record<string, unknown>;
  /** Whether running it changes nothing: a lookup, as opposed to a send or a create. */
  readonly readOnly: boolean;
  /** What a successful execution answers with, given the arguments it received. */
  readonly respond: (args: Record<string, unknown>) => Record<string, unknown>;
}

export interface Connection {
  readonly id: string;
  readonly projectLabel: string;
  readonly userId: string;
  readonly toolkit: string;
  readonly authConfigId: string;
  status: 'INITIATED' | 'ACTIVE';
  readonly wordId: string;
  readonly alias: string | null;
  /** Status reads left before the account turns `ACTIVE`; `null` when it never will. */
  pollsUntilActive: number | null;
  /** Whether the person approved it, as opposed to a seeded or self-completing connection. */
  approvedByPerson: boolean;
  /** Whether an answer has told a caller that the account is `ACTIVE`. */
  reportedActive: boolean;
}

export interface ReleaseAsset {
  readonly name: string;
  readonly read: () => Uint8Array;
}

/** A GitHub release of the CLI, as `composio upgrade` and the update check see it. */
export interface Release {
  readonly tag: string;
  readonly prerelease: boolean;
  readonly assets: ReadonlyArray<ReleaseAsset>;
}

export interface AuthConfig {
  readonly id: string;
  readonly uuid: string;
  readonly projectLabel: string;
  readonly toolkit: string;
  readonly name: string;
}

export interface CliLoginSession {
  readonly id: string;
  readonly code: string;
  status: 'pending' | 'linked';
  /** Whether an answer has told a caller that the session is linked. */
  reportedLinked: boolean;
}

export interface ToolRouterSession {
  readonly id: string;
  readonly projectLabel: string;
  readonly userId: string;
}

export const ORG: SeededOrg = { id: 'ok_e2eacme00001', name: 'Acme E2E', plan: 'BUSINESS' };

/** A second organization the same person belongs to, for `--org` and `orgs` rows. */
export const OTHER_ORG: SeededOrg = { id: 'ok_e2eglobex001', name: 'Globex E2E', plan: 'HOBBY' };

export const MEMBER: SeededMember = {
  id: '00000000-0000-4000-8000-00000000a001',
  email: 'dev@acme-e2e.test',
  name: 'Dev Eloper',
  role: 'admin',
};

/** The user API key (`uk_`) a completed login stores. */
export const USER_API_KEY = 'uk_e2e_acme_user_key_0001';

/** A well-formed user key this deployment never issued. */
export const FOREIGN_USER_API_KEY = 'uk_e2e_issued_elsewhere_9999';

export const CONSUMER_PROJECT: SeededProject = {
  label: 'consumer',
  kind: 'consumer',
  autoId: 1001,
  uuid: '00000000-0000-4000-8000-00000000c001',
  nanoId: 'pr_e2econsumer01',
  name: 'acme-e2e-consumer',
  orgId: ORG.id,
  apiKey: 'ak_e2e_consumer_project_key',
};

export const DEVELOPER_PROJECT: SeededProject = {
  label: 'developer',
  kind: 'developer',
  autoId: 2001,
  uuid: '00000000-0000-4000-8000-00000000d001',
  nanoId: 'pr_e2edeveloper1',
  name: 'acme-e2e-dev',
  orgId: ORG.id,
  apiKey: 'ak_e2e_developer_project_key',
};

/** A second developer project, the target of `--project-name`. */
export const OTHER_DEVELOPER_PROJECT: SeededProject = {
  label: 'developer-other',
  kind: 'developer',
  autoId: 2002,
  uuid: '00000000-0000-4000-8000-00000000d002',
  nanoId: 'pr_e2edeveloper2',
  name: 'acme-e2e-staging',
  orgId: ORG.id,
  apiKey: 'ak_e2e_developer_other_key',
};

/** The consumer user: the logged-in person inside their consumer project. */
export const CONSUMER_USER_ID = 'consumer-user-e2e-acme-0001';

/** The global test user a login stores for the dev tree. */
export const GLOBAL_TEST_USER_ID = `pg-test-${MEMBER.id}`;

export const TOOLKITS: ReadonlyArray<SeededToolkit> = [
  {
    slug: 'slack',
    name: 'Slack',
    description: 'Send messages and manage channels in Slack.',
    noAuth: false,
    version: '20260101_00',
  },
  {
    slug: 'github',
    name: 'GitHub',
    description: 'Work with repositories, issues, and pull requests.',
    noAuth: false,
    version: '20260101_00',
  },
  {
    slug: 'gmail',
    name: 'Gmail',
    description: 'Read and send email with Gmail.',
    noAuth: false,
    version: '20260101_00',
  },
  {
    slug: 'hackernews',
    name: 'Hacker News',
    description: 'Read stories and user profiles from Hacker News.',
    noAuth: true,
    version: '20260101_00',
  },
];

const objectSchema = (
  properties: Record<string, { type: string; description: string }>,
  required: ReadonlyArray<string>
) => ({ type: 'object', properties, required: [...required] });

export const TOOLS: ReadonlyArray<SeededTool> = [
  {
    slug: 'SLACK_SEND_MESSAGE',
    name: 'Send message',
    toolkit: 'slack',
    description: 'Posts a message to a Slack channel.',
    inputParameters: objectSchema(
      {
        channel: { type: 'string', description: 'Channel name or id to post to.' },
        text: { type: 'string', description: 'Message text.' },
      },
      ['channel', 'text']
    ),
    readOnly: false,
    respond: args => ({
      ok: true,
      channel: args.channel ?? null,
      ts: '1767225600.000100',
      message: { text: args.text ?? null },
    }),
  },
  {
    slug: 'GITHUB_CREATE_AN_ISSUE',
    name: 'Create an issue',
    toolkit: 'github',
    description: 'Creates an issue in a GitHub repository.',
    inputParameters: objectSchema(
      {
        owner: { type: 'string', description: 'Repository owner.' },
        repo: { type: 'string', description: 'Repository name.' },
        title: { type: 'string', description: 'Issue title.' },
        body: { type: 'string', description: 'Issue body.' },
      },
      ['owner', 'repo', 'title']
    ),
    readOnly: false,
    respond: args => ({
      number: 101,
      title: args.title ?? null,
      html_url: `https://github.com/${String(args.owner)}/${String(args.repo)}/issues/101`,
    }),
  },
  {
    slug: 'GITHUB_GET_THE_AUTHENTICATED_USER',
    name: 'Get the authenticated user',
    toolkit: 'github',
    description: 'Returns the profile of the connected GitHub account.',
    inputParameters: objectSchema({}, []),
    readOnly: true,
    respond: () => ({ login: 'acme-e2e-dev', id: 4242 }),
  },
  {
    slug: 'GMAIL_SEND_EMAIL',
    name: 'Send email',
    toolkit: 'gmail',
    description: 'Sends an email from the connected Gmail account.',
    inputParameters: objectSchema(
      {
        recipient_email: { type: 'string', description: 'Recipient address.' },
        subject: { type: 'string', description: 'Subject line.' },
        body: { type: 'string', description: 'Message body.' },
      },
      ['recipient_email']
    ),
    readOnly: false,
    respond: () => ({ id: 'msg_e2e_0001', labelIds: ['SENT'] }),
  },
  {
    slug: 'HACKERNEWS_GET_USER',
    name: 'Get user',
    toolkit: 'hackernews',
    description: 'Returns a Hacker News user profile.',
    inputParameters: objectSchema(
      { username: { type: 'string', description: 'Hacker News username.' } },
      ['username']
    ),
    readOnly: true,
    respond: args => ({ id: args.username ?? null, karma: 157316 }),
  },
];

/** Mutable state; one instance per fake backend. */
export class World {
  readonly org = ORG;
  readonly organizations: ReadonlyArray<SeededOrg> = [ORG, OTHER_ORG];
  readonly member = MEMBER;
  readonly userApiKey: string;
  readonly projects: ReadonlyArray<SeededProject> = [
    CONSUMER_PROJECT,
    DEVELOPER_PROJECT,
    OTHER_DEVELOPER_PROJECT,
  ];
  /** The project an unscoped user-key request acts on, as `auth/session/info` reports it. */
  readonly defaultProject = DEVELOPER_PROJECT;
  readonly toolkits = TOOLKITS;
  readonly tools = TOOLS;

  readonly connections: Connection[] = [];
  readonly authConfigs: AuthConfig[] = [];
  readonly loginSessions: CliLoginSession[] = [];
  readonly toolRouterSessions: ToolRouterSession[] = [];
  /** Project API keys minted by `POST …/api_keys/create`, newest last. */
  readonly mintedProjectKeys: Array<{ key: string; projectLabel: string; name: string }> = [];
  /** Published CLI releases. Empty by default: no update is ever on offer. */
  readonly releases: Release[] = [];
  /**
   * How a link request ends, standing in for the person at the OAuth screen:
   * the number of status reads before the account is `ACTIVE`, or `null` when
   * nobody ever finishes authorizing.
   */
  linkCompletesAfterPolls: number | null = 1;
  private toolExecutions = 0;

  constructor(options: { userApiKey?: string } = {}) {
    this.userApiKey = options.userApiKey ?? USER_API_KEY;
    // Each developer project starts with one Composio-managed auth config per
    // toolkit that needs auth, as a fresh project gets on first use.
    for (const project of this.projects.filter(p => p.kind === 'developer')) {
      for (const toolkit of this.toolkits.filter(t => !t.noAuth)) {
        this.authConfigForToolkit(project.label, toolkit.slug);
      }
    }
  }

  projectByLabel(label: string): SeededProject {
    const project = this.projects.find(p => p.label === label);
    if (!project) throw new Error(`No seeded project labelled ${label}`);
    return project;
  }

  /** A project by nano id, uuid, or name: the ids a request can carry. */
  findProject(reference: string | undefined): SeededProject | undefined {
    if (!reference) return undefined;
    return this.projects.find(
      p => p.nanoId === reference || p.uuid === reference || p.name === reference
    );
  }

  projectForApiKey(key: string): SeededProject | undefined {
    const minted = this.mintedProjectKeys.find(k => k.key === key);
    if (minted) return this.projectByLabel(minted.projectLabel);
    return this.projects.find(p => p.apiKey === key);
  }

  findToolkit(slug: string): SeededToolkit | undefined {
    return this.toolkits.find(t => t.slug === slug.toLowerCase());
  }

  findTool(slug: string): SeededTool | undefined {
    return this.tools.find(t => t.slug === slug.toUpperCase());
  }

  authConfigForToolkit(projectLabel: string, toolkit: string): AuthConfig {
    const existing = this.authConfigs.find(
      a => a.projectLabel === projectLabel && a.toolkit === toolkit
    );
    if (existing) return existing;
    const ordinal = String(this.authConfigs.length + 1).padStart(4, '0');
    const created: AuthConfig = {
      id: `ac_e2e${ordinal}`,
      uuid: `00000000-0000-4000-8000-0000000a${ordinal}`,
      projectLabel,
      toolkit,
      name: `${toolkit}-${projectLabel}`,
    };
    this.authConfigs.push(created);
    return created;
  }

  activeConnection(projectLabel: string, userId: string, toolkit: string): Connection | undefined {
    return this.connections.find(
      c =>
        c.projectLabel === projectLabel &&
        c.userId === userId &&
        c.toolkit === toolkit &&
        c.status === 'ACTIVE'
    );
  }

  /** `activeConnection` for answering a request: the caller now knows the account is active. */
  reportActiveConnection(
    projectLabel: string,
    userId: string,
    toolkit: string
  ): Connection | undefined {
    const connection = this.activeConnection(projectLabel, userId, toolkit);
    if (connection) connection.reportedActive = true;
    return connection;
  }

  /** Starts a connection the way a link request does: `INITIATED`, with a redirect to follow. */
  beginConnection(params: {
    projectLabel: string;
    userId: string;
    toolkit: string;
    alias?: string | null;
  }): Connection {
    const ordinal = String(this.connections.length + 1).padStart(4, '0');
    const connection: Connection = {
      id: `ca_e2e${ordinal}`,
      projectLabel: params.projectLabel,
      userId: params.userId,
      toolkit: params.toolkit,
      authConfigId: this.authConfigForToolkit(params.projectLabel, params.toolkit).id,
      status: 'INITIATED',
      wordId: `${params.toolkit}_e2e_${ordinal}`,
      alias: params.alias ?? null,
      pollsUntilActive: this.linkCompletesAfterPolls,
      approvedByPerson: false,
      reportedActive: false,
    };
    this.connections.push(connection);
    return connection;
  }

  /** One status read of a pending connection, which may be the one that finds it authorized. */
  pollConnection(connection: Connection): void {
    if (connection.status === 'ACTIVE' || connection.pollsUntilActive === null) return;
    connection.pollsUntilActive -= 1;
    if (connection.pollsUntilActive <= 0) connection.status = 'ACTIVE';
  }

  /** Seeds an already-active connection, for journeys that start connected. */
  connect(projectLabel: string, userId: string, toolkit: string): Connection {
    const connection = this.beginConnection({ projectLabel, userId, toolkit });
    connection.status = 'ACTIVE';
    return connection;
  }

  /** Stands in for the person approving one authorization; `false` when there is none pending under that id. */
  authorizeConnection(id: string): boolean {
    const connection = this.connections.find(c => c.id === id && c.status === 'INITIATED');
    if (!connection) return false;
    connection.status = 'ACTIVE';
    connection.approvedByPerson = true;
    return true;
  }

  /**
   * Ids of the login sessions and connections the person approved that no
   * answer has reported yet: the CLI, and so the agent, cannot know of them.
   */
  unreportedApprovals(): ReadonlyArray<string> {
    return [
      ...this.loginSessions
        .filter(session => session.status === 'linked' && !session.reportedLinked)
        .map(session => session.id),
      ...this.connections
        .filter(connection => connection.approvedByPerson && !connection.reportedActive)
        .map(connection => connection.id),
    ];
  }

  createLoginSession(): CliLoginSession {
    const ordinal = String(this.loginSessions.length + 1).padStart(4, '0');
    const session: CliLoginSession = {
      id: `00000000-0000-4000-8000-00000005${ordinal}`,
      code: `E2E${ordinal.slice(1)}`,
      status: 'pending',
      reportedLinked: false,
    };
    this.loginSessions.push(session);
    return session;
  }

  /** Stands in for the person approving the login in the browser. */
  linkLoginSession(idOrCode?: string): CliLoginSession {
    const session = idOrCode
      ? this.loginSessions.find(s => s.id === idOrCode || s.code === idOrCode)
      : this.loginSessions.at(-1);
    if (!session) throw new Error('No CLI login session to link');
    session.status = 'linked';
    return session;
  }

  createToolRouterSession(projectLabel: string, userId: string): ToolRouterSession {
    const ordinal = String(this.toolRouterSessions.length + 1).padStart(4, '0');
    const session: ToolRouterSession = { id: `trs_e2e${ordinal}`, projectLabel, userId };
    this.toolRouterSessions.push(session);
    return session;
  }

  mintProjectKey(projectLabel: string, name: string): string {
    const ordinal = String(this.mintedProjectKeys.length + 1).padStart(4, '0');
    const key = `ak_e2e_minted_${projectLabel.replace(/[^a-z]/g, '')}_${ordinal}`;
    this.mintedProjectKeys.push({ key, projectLabel, name });
    return key;
  }

  nextLogId(): string {
    this.toolExecutions += 1;
    return `log_e2e${String(this.toolExecutions).padStart(4, '0')}`;
  }
}
