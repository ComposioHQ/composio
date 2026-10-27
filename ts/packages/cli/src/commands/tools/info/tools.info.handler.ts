import type { ToolRetrieveResponse } from '@composio/client/resources/tools';
import { Effect, Option } from 'effect';
import { commandInputError } from 'src/commands/errors';
import { handleClientApiError } from 'src/effects/handle-http-error';
import { commandHintStep } from 'src/services/command-hints';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { CLIENT_API_ERROR_TAGS } from 'src/services/composio-errors';
import { TerminalUI } from 'src/services/terminal-ui';
import { normalizeFileUploadSchema } from 'src/services/tool-file-uploads';
import { getOrFetchToolInputDefinition } from 'src/services/tool-input-validation';
import {
  MISSING_SLUG_HINT,
  MISSING_SLUG_MESSAGE,
  executeToolHint,
  fetchingToolMessage,
  formatToolInfoJson,
  formatToolInfoSummary,
  inspectSchemaHint,
  toolInfoNoteTitle,
  toolNotFoundMessage,
  toolSuggestion,
} from './tools.info.format';

/** The arguments of `composio tools info`. */
export type ToolsInfoParams = {
  readonly slug: Option.Option<string>;
};

const invalidInput = commandInputError('tools info');

/** A missing slug fails with a usage error that carries an example, before any request. */
const missingSlug = () => invalidInput(`${MISSING_SLUG_MESSAGE}\n${MISSING_SLUG_HINT}`, '<slug>');

/**
 * Fetches the tool, or reports the API failure with "did you mean" suggestions and fails
 * already reported (exit 1).
 */
const fetchTool = (slug: string) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;
    return yield* ui.withSpinner(fetchingToolMessage(slug), repo.getToolDetailed(slug)).pipe(
      Effect.asSome,
      Effect.catchTag(
        CLIENT_API_ERROR_TAGS,
        handleClientApiError(ui, {
          fallbackMessage: toolNotFoundMessage(slug),
          hint: [
            commandHintStep('Browse available toolkits', 'dev.toolkits.list'),
            commandHintStep('Then list tools', 'root.tools.list'),
          ].join('\n'),
          fallbackValue: Option.none<ToolRetrieveResponse>(),
          searchForSuggestions: () =>
            repo
              .searchTools({ search: slug, limit: 3 })
              .pipe(Effect.map(result => result.items.map(toolSuggestion))),
        })
      )
    );
  });

const showTool = (slug: string, tool: ToolRetrieveResponse) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const definition = yield* getOrFetchToolInputDefinition(slug);

    yield* ui.note(formatToolInfoSummary(tool, definition), toolInfoNoteTitle(tool));
    yield* ui.log.step(inspectSchemaHint(definition));
    yield* ui.log.step(executeToolHint(tool));
    yield* ui.output(
      formatToolInfoJson(tool, definition, normalizeFileUploadSchema(definition.schema))
    );
  });

/**
 * View a brief summary of a tool and the CLI-facing input schema `composio execute` uses.
 *
 * @example
 * ```bash
 * composio tools info "GMAIL_SEND_EMAIL"
 * ```
 */
export const runToolsInfo = ({ slug }: ToolsInfoParams) =>
  Effect.gen(function* () {
    return yield* Option.match(slug, {
      onNone: () => Effect.fail(missingSlug()),
      onSome: slugValue =>
        fetchTool(slugValue).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.void,
              onSome: tool => showTool(slugValue, tool),
            })
          )
        ),
    });
  });
