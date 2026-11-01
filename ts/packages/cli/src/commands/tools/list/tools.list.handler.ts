import { Array as Arr, Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { clampLimit } from 'src/ui/clamp-limit';
import { formatToolsJson } from '../format';
import {
  FETCHING_TOOLS_MESSAGE,
  formatToolsListing,
  inspectToolHint,
  noToolsFoundMessage,
} from './tools.list.format';

/** The arguments and flags of `composio tools list`. */
export type ToolsListParams = {
  readonly toolkit: string;
  readonly query: Option.Option<string>;
  readonly tags: Option.Option<string>;
  readonly limit: number;
};

/**
 * List available tools for a toolkit with optional filters. Prints the first page only.
 *
 * @example
 * ```bash
 * composio tools list gmail
 * composio tools list gmail --query "send email"
 * composio tools list gmail --tags "important" --limit 10
 * ```
 */
export const runToolsList = ({ toolkit, query, tags, limit }: ToolsListParams) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    const result = yield* ui.withSpinner(
      FETCHING_TOOLS_MESSAGE,
      repo.searchTools({
        search: Option.getOrUndefined(query),
        toolkit_slug: toolkit,
        tags: Option.getOrUndefined(tags),
        limit: clampLimit(limit),
      })
    );

    yield* Arr.match(result.items, {
      onEmpty: () => ui.log.warn(noToolsFoundMessage(toolkit)),
      onNonEmpty: tools =>
        Effect.gen(function* () {
          yield* ui.log.info(formatToolsListing(tools, result.total_pages));

          const firstSlug = Arr.headNonEmpty(tools).slug;
          if (firstSlug) {
            yield* ui.log.step(inspectToolHint(firstSlug));
          }

          yield* ui.output(formatToolsJson(tools));
        }),
    });
  });
