import { Args, Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import { handleHttpServerError } from 'src/effects/handle-http-error';
import { getOrFetchToolInputDefinition } from 'src/services/tool-input-validation';
import { bold } from 'src/ui/colors';
import { commandHintExample, commandHintStep } from 'src/services/command-hints';

const slug = Args.text({ name: 'slug' }).pipe(
  Args.withDescription('Tool slug (e.g. "GMAIL_SEND_EMAIL")'),
  Args.optional
);

/**
 * View details of a specific tool including input/output schemas.
 *
 * @example
 * ```bash
 * composio tools info "GMAIL_SEND_EMAIL"
 * ```
 */
export const toolsCmd$Info = Command.make('info', { slug }, ({ slug }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    // Missing slug guard
    if (Option.isNone(slug)) {
      yield* ui.log.warn('Missing required argument: <slug>');
      yield* ui.log.step('Try specifying a tool slug, e.g.:\n> composio tools info "GMAIL_SEND_EMAIL"');
      return;
    }

    const slugValue = slug.value;

    const toolOpt = yield* ui
      .withSpinner(`Fetching tool "${slugValue}"...`, repo.getToolDetailed(slugValue))
      .pipe(
        Effect.asSome,
        Effect.catchTag(
          'services/HttpServerError',
          handleHttpServerError(ui, {
            fallbackMessage: `Tool "${slugValue}" not found.`,
            hint: [
              commandHintStep('Browse available toolkits', 'dev.toolkits.list'),
              commandHintStep('Then list tools', 'root.tools.list'),
            ].join('\n'),
            fallbackValue: Option.none(),
            searchForSuggestions: () =>
              repo.searchTools({ search: slugValue, limit: 3 }).pipe(
                Effect.map(r =>
                  r.items.map(s => ({
                    label: `${s.slug} — ${s.description}`,
                    command: `> composio tools info "${s.slug}"`,
                  }))
                )
              ),
          })
        )
      );

    if (Option.isNone(toolOpt)) {
      return;
    }

    const tool = toolOpt.value;
    const definition = yield* getOrFetchToolInputDefinition(slugValue);

    const summary = [
      `${bold('Slug:')} ${tool.slug}`,
      `${bold('Name:')} ${tool.name}`,
      `${bold('Toolkit:')} ${tool.toolkit.slug}`,
      `${bold('Version:')} ${definition.version ?? '-'}`,
      `${bold('Description:')} ${tool.description}`,
      `${bold('Schema Cache:')} ${definition.schemaPath}`,
    ].join('\n');

    yield* ui.note(summary, `Tool: ${tool.name}`);
    yield* ui.log.step(
      `Inspect schema with jq:\n> jq '{required: (.inputSchema.required // []), keys: (.inputSchema.properties | keys)}' "${definition.schemaPath}"`
    );
    yield* ui.log.step(
      `Then execute it:\n> ${commandHintExample('root.execute', {
        slug: tool.slug,
      })} --dry-run`
    );
    yield* ui.output(
      JSON.stringify(
        {
          slug: tool.slug,
          name: tool.name,
          description: tool.description,
          toolkit: tool.toolkit.slug,
          version: definition.version,
          schemaPath: definition.schemaPath,
        },
        null,
        2
      )
    );
  })
).pipe(
  Command.withDescription(
    'View a brief summary of a tool and cache the same raw schema used by `composio execute --get-schema`.'
  )
);
