import { Array as Arr, Effect, Option } from 'effect';
import type { CommandTree } from 'src/commands/surface';
import { BROWSE_TOOLKITS_HINT } from 'src/commands/toolkits/format';
import { reportFailure } from 'src/effects/report-failure';
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
  "`composio link` does not accept `--auth-config`. To link through a developer project's auth config, run `composio dev connected-accounts link --auth-config <id>`.";

export const TOOLKIT_AND_AUTH_CONFIG_MESSAGE =
  'Pass a toolkit or `--auth-config`, not both.\n' +
  '  Tool Router: composio dev connected-accounts link <toolkit>\n' +
  '  Legacy:      composio dev connected-accounts link --auth-config <id>';

export const missingArgumentMessage = (tree: CommandTree) =>
  tree === 'root'
    ? 'Pass the toolkit to link.\n  composio link github'
    : 'Pass the toolkit to link, or `--auth-config`.\n' +
      '  composio dev connected-accounts link github\n' +
      '  composio dev connected-accounts link --auth-config <id>';

export const LIST_REQUIRES_TOOLKIT_MESSAGE =
  '`--list` needs a toolkit, for example `composio link gmail --list`.';

export const LIST_WITH_AUTH_CONFIG_MESSAGE = '`--list` cannot be combined with `--auth-config`.';

export const AUTH_CONFIG_SCOPE_MESSAGE =
  '`--auth-config` needs a developer project. Pass `--project-name <name>`, or run the command in a directory set up with `composio dev init`.';

export const INCOMPLETE_LINK_RESPONSE_MESSAGE =
  'The link response from the API is missing `connected_account_id` or `redirect_url`.';

// The canonical constant lives with the other toolkit formatters; re-exported here for the
// link flow's callers.
export { BROWSE_TOOLKITS_HINT };

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

/** `id (alias, word_id)` per account, comma separated. An account without labels is its id. */
const formatExistingAccountLabels = (items: ReadonlyArray<ExistingAccountLabel>) =>
  items
    .map(item =>
      Arr.match(
        [item.alias, item.word_id].filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0
        ),
        {
          onEmpty: () => item.id,
          onNonEmpty: labels => `${item.id} (${labels.join(', ')})`,
        }
      )
    )
    .join(', ');

/**
 * Why a second account needs `--alias` (exit 1), and which accounts already exist for the scope.
 */
export const showExistingAccounts = (
  ui: TerminalUI,
  scopeDescription: string,
  items: ReadonlyArray<ExistingAccountLabel>
) =>
  Effect.gen(function* () {
    yield* reportFailure(
      ui,
      `A connected account already exists for ${scopeDescription}. Pass --alias to create another one.`
    );
    yield* ui.note(formatExistingAccountLabels(items), 'Existing accounts');
  });

/**
 * The alias is taken (exit 1): which account holds it, and how to use that account or list them
 * all. The hint commands differ per tree, so the caller passes them.
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
    yield* reportFailure(
      ui,
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
  Arr.match(items, {
    onEmpty: () => ui.log.warn(`No active connected accounts found for "${toolkitSlug}".`),
    onNonEmpty: accounts =>
      ui.note(formatConnectedAccountsTable(accounts), `${toolkitSlug}: connected accounts`),
  });

/**
 * The dashboard page that connects a toolkit Composio does not manage auth for. Path segments
 * are encoded so an org name with spaces or `@` does not bake `?open=true` into the path.
 */
export const dashboardConnectUrl = (webURL: string, orgName: string, toolkitSlug: string) =>
  `${webURL.replace(/\/+$/, '')}/${encodeURIComponent(orgName)}/~/connect/apps/${encodeURIComponent(toolkitSlug)}?open=true`;

/** The warning that precedes the dashboard URL when Composio does not manage a toolkit's auth. */
export const unmanagedAuthMessage = (toolkitSlug: string, noBrowser: boolean) =>
  `Composio does not manage auth for "${toolkitSlug}". ${noBrowser ? 'Open the dashboard to connect it there.' : 'Opening the dashboard to connect it there.'}`;

/** The success line once polling sees the account `ACTIVE`. Also the `message` of its payload. */
export const activeConnectionMessage = (account: {
  readonly id: string;
  readonly toolkit: { readonly slug: string };
}) => `Connected account "${account.id}" is now ACTIVE (toolkit: ${account.toolkit.slug}).`;

// --- machine renderers (stdout) ---------------------------------------------------------------

/**
 * A payload as `link` prints it on stdout: indented by two spaces, without a trailing newline,
 * since `ui.output` adds one. Key order is part of the output.
 */
const toStdoutJson = (payload: object) => JSON.stringify(payload, null, 2);

/** The `--no-wait` payload: the link to finish by hand. `toolkit` is set by the Tool Router flow. */
export const formatPendingLinkJson = (params: {
  readonly target: LinkTarget;
  readonly toolkit: Option.Option<string>;
  readonly projectType: CliProjectType;
}) =>
  toStdoutJson({
    status: 'pending',
    message: 'Complete authorization by opening the URL',
    connected_account_id: params.target.connectedAccountId,
    redirect_url: params.target.redirectUrl,
    ...Option.match(params.toolkit, { onNone: () => ({}), onSome: toolkit => ({ toolkit }) }),
    project_type: params.projectType,
  });

/** The payload once the account is `ACTIVE`. */
export const formatActiveLinkJson = (params: {
  readonly account: { readonly id: string; readonly toolkit: { readonly slug: string } };
  readonly redirectUrl: string;
}) =>
  toStdoutJson({
    status: 'success',
    message: activeConnectionMessage(params.account),
    connected_account_id: params.account.id,
    toolkit: params.account.toolkit.slug,
    redirect_url: params.redirectUrl,
  });

/**
 * The `--list` payload: the toolkit's active accounts, schema-filtered upstream. The empty case
 * lists `items` before `total`, the other case after.
 */
export const formatConnectedAccountsListJson = (
  toolkitSlug: string,
  items: ReadonlyArray<ConnectedAccountItem>
) =>
  toStdoutJson(
    Arr.match(items, {
      onEmpty: () => ({ toolkit: toolkitSlug, items: [], total: 0 }),
      onNonEmpty: accounts => ({ toolkit: toolkitSlug, total: accounts.length, items: accounts }),
    })
  );
