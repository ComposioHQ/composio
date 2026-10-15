import { Effect, Option, pipe } from 'effect';
import type { CommandTree } from 'src/commands/surface';
import type { ConnectedAccountItem } from 'src/models/connected-accounts';
import type { CliProjectType } from 'src/services/command-project';
import type { TerminalUI } from 'src/services/terminal-ui';
import { formatConnectedAccountsTable } from '../format';

/** A connected account as the link flows label it: id first, alias and word id when set. */
export interface ExistingAccountLabel {
  readonly id: string;
  readonly alias?: string | null;
  readonly word_id?: string | null;
}

/** A link the API created: the account it belongs to and the page that authorizes it. */
export interface LinkTarget {
  readonly connectedAccountId: string;
  readonly redirectUrl: string;
}

// --- usage messages the parser cannot produce; printed on stderr --------------------------

export const ROOT_AUTH_CONFIG_MESSAGE =
  'Top-level `composio link` is consumer-only and does not accept `--auth-config`. Use `composio dev connected-accounts link --auth-config ...` for developer-scoped usage.';

export const TOOLKIT_AND_AUTH_CONFIG_MESSAGE =
  'Cannot use both <toolkit> and --auth-config. Choose one:\n' +
  '  Tool Router: composio dev connected-accounts link <toolkit>\n' +
  '  Legacy:      composio dev connected-accounts link --auth-config <id>';

export const missingArgumentMessage = (tree: CommandTree) =>
  tree === 'root'
    ? 'Missing argument. Provide a toolkit slug:\n  composio link github'
    : 'Missing argument. Provide a toolkit slug or --auth-config:\n' +
      '  composio dev connected-accounts link github\n' +
      '  composio dev connected-accounts link --auth-config "ac_..."';

export const LIST_REQUIRES_TOOLKIT_MESSAGE =
  '`--list` requires a toolkit slug, e.g. `composio link gmail --list`.';

export const LIST_WITH_AUTH_CONFIG_MESSAGE = '`--list` cannot be combined with `--auth-config`.';

export const AUTH_CONFIG_SCOPE_MESSAGE =
  '`--auth-config` is developer-project scoped. Pass `--project-name <name>` or run from a directory initialized with `composio dev init`.';

export const INCOMPLETE_LINK_RESPONSE_MESSAGE =
  'The API returned an incomplete link response (missing connected_account_id or redirect_url).';

export const BROWSE_TOOLKITS_HINT = 'Browse available toolkits:\n> composio dev toolkits list';

export const BROWSE_AUTH_CONFIGS_HINT =
  'Browse available auth configs:\n> composio dev auth-configs list';

// --- human renderers (stderr) ---------------------------------------------------------------

/**
 * Points the user at the authorization page: a step line and the URL as a note. `manual` is
 * for a page the CLI does not open itself.
 */
export const showRedirectUrl = (
  ui: TerminalUI,
  redirectUrl: string,
  options: { readonly manual: boolean }
) =>
  Effect.gen(function* () {
    yield* ui.log.step(
      options.manual
        ? 'Open this URL in your browser to authorize'
        : 'Redirecting you to the authorization page'
    );
    yield* ui.note(redirectUrl, 'Redirect URL');
  });

/** `id (alias, word_id)` per account, comma separated; an account without labels is its id. */
export const formatExistingAccountLabels = (items: ReadonlyArray<ExistingAccountLabel>) =>
  items
    .map(item => {
      const labels = [item.alias, item.word_id].filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      );
      return labels.length > 0 ? `${item.id} (${labels.join(', ')})` : item.id;
    })
    .join(', ');

/** Why a second account needs `--alias`, and which accounts already exist for the scope. */
export const showExistingAccounts = (
  ui: TerminalUI,
  scopeDescription: string,
  items: ReadonlyArray<ExistingAccountLabel>
) =>
  Effect.gen(function* () {
    yield* ui.log.error(
      `A connected account already exists for ${scopeDescription}. Pass --alias to create another one.`
    );
    yield* ui.note(formatExistingAccountLabels(items), 'Existing accounts');
  });

/**
 * The alias is taken: which account holds it, and how to use that account or list them all.
 * The hint commands differ per tree, so the caller passes them.
 */
export const showAliasConflict = (
  ui: TerminalUI,
  params: {
    readonly alias: string;
    readonly existingId: string;
    readonly executeCommand: string;
    readonly listCommand: string;
  }
) =>
  Effect.gen(function* () {
    yield* ui.log.error(
      `Alias "${params.alias}" is already in use by connected account "${params.existingId}".`
    );
    yield* ui.note(
      [
        `Use the existing alias: ${params.executeCommand} <TOOL_SLUG> --account ${params.alias} -d '{ ... }'`,
        `List connected accounts: ${params.listCommand}`,
      ].join('\n'),
      'Tips'
    );
  });

/** The table of a toolkit's active accounts as a note, or a warning when there are none. */
export const showConnectedAccounts = (
  ui: TerminalUI,
  toolkitSlug: string,
  items: ReadonlyArray<ConnectedAccountItem>
) =>
  items.length === 0
    ? ui.log.warn(`No active connected accounts found for "${toolkitSlug}".`)
    : ui.note(formatConnectedAccountsTable(items), `${toolkitSlug}: connected accounts`);

/**
 * The dashboard page that connects a toolkit Composio does not manage auth for. Path segments
 * are encoded so an org name with spaces or `@` does not bake `?open=true` into the path.
 */
export const dashboardConnectUrl = (webURL: string, orgName: string, toolkitSlug: string) =>
  `${webURL.replace(/\/+$/, '')}/${encodeURIComponent(orgName)}/~/connect/apps/${encodeURIComponent(toolkitSlug)}?open=true`;

/** The warning that precedes the dashboard URL when Composio does not manage a toolkit's auth. */
export const unmanagedAuthMessage = (toolkitSlug: string, noBrowser: boolean) =>
  `Composio does not manage auth for "${toolkitSlug}" — ${noBrowser ? 'open the dashboard' : 'opening the dashboard'} to connect manually.`;

/** The success line once polling sees the account `ACTIVE`. */
export const activeConnectionMessage = (account: {
  readonly id: string;
  readonly toolkit: { readonly slug: string };
}) => `Connected account "${account.id}" is now ACTIVE (toolkit: ${account.toolkit.slug}).`;

// --- machine renderers (stdout) ---------------------------------------------------------------

/** The `--no-wait` payload: the link to finish by hand. `toolkit` is set by the Tool Router flow. */
export const formatPendingLinkJson = (params: {
  readonly target: LinkTarget;
  readonly toolkit: Option.Option<string>;
  readonly projectType: CliProjectType;
}) =>
  JSON.stringify(
    {
      status: 'pending',
      message: 'Complete authorization by opening the URL',
      connected_account_id: params.target.connectedAccountId,
      redirect_url: params.target.redirectUrl,
      ...pipe(
        params.toolkit,
        Option.map(toolkit => ({ toolkit })),
        Option.getOrElse(() => ({}))
      ),
      project_type: params.projectType,
    },
    null,
    2
  );

/** The payload once the account is `ACTIVE`; `message` is the success line already printed. */
export const formatActiveLinkJson = (params: {
  readonly account: { readonly id: string; readonly toolkit: { readonly slug: string } };
  readonly redirectUrl: string;
}) =>
  JSON.stringify(
    {
      status: 'success',
      message: activeConnectionMessage(params.account),
      connected_account_id: params.account.id,
      toolkit: params.account.toolkit.slug,
      redirect_url: params.redirectUrl,
    },
    null,
    2
  );

/** The `--list` payload: the toolkit's active accounts, schema-filtered upstream. */
export const formatConnectedAccountsListJson = (
  toolkitSlug: string,
  items: ReadonlyArray<ConnectedAccountItem>
) =>
  JSON.stringify(
    items.length === 0
      ? { toolkit: toolkitSlug, items: [], total: 0 }
      : { toolkit: toolkitSlug, total: items.length, items },
    null,
    2
  );
