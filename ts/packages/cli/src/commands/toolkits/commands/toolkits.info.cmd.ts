import { Args, Command } from '@effect/cli';
import { Effect, Option } from 'effect';
import { ComposioToolkitsRepository, HttpServerError } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { requireAuth } from 'src/effects/require-auth';
import type { ToolkitDetailed, AuthConfigDetail } from 'src/models/toolkits';
import { bold, gray } from 'src/ui/colors';

const slug = Args.text({ name: 'slug' }).pipe(
  Args.withDescription('Toolkit slug (e.g. "gmail")'),
  Args.optional
);

/**
 * Format auth config fields for display.
 */
function formatFields(fields: ReadonlyArray<AuthConfigDetail['fields']['auth_config_creation']>) {
  const lines: string[] = [];

  for (const group of fields) {
    const allFields = [
      ...group.required.map(f => ({ ...f, label: 'required' })),
      ...group.optional.map(f => ({ ...f, label: 'optional' })),
    ];

    if (allFields.length === 0) {
      lines.push('    (none)');
    } else {
      const nameWidth = Math.max(...allFields.map(f => f.name.length));
      const labelWidth = Math.max(...allFields.map(f => f.label.length));
      const typeWidth = Math.max(...allFields.map(f => f.type.length));

      for (const field of allFields) {
        const desc = field.description ? `  ${gray(`"${field.description}"`)}` : '';
        lines.push(
          `    ${field.name.padEnd(nameWidth)} ${field.label.padEnd(labelWidth)} ${field.type.padEnd(typeWidth)}${desc}`
        );
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format a detailed toolkit for interactive display.
 */
function formatToolkitInfo(toolkit: ToolkitDetailed): string {
  const lines: string[] = [];

  lines.push(`${bold('Name:')} ${toolkit.name}`);
  lines.push(`${bold('Slug:')} ${toolkit.slug}`);
  lines.push(`${bold('Description:')} ${toolkit.meta.description || '(none)'}`);

  // Derive auth schemes from auth_config_details
  const authSchemes = toolkit.auth_config_details.map(d => d.mode);
  if (toolkit.no_auth) {
    lines.push(`${bold('Auth:')} No authentication required`);
  } else if (authSchemes.length > 0) {
    lines.push(`${bold('Auth Schemes:')} ${authSchemes.join(', ')}`);
    if (toolkit.composio_managed_auth_schemes.length > 0) {
      lines.push(
        `${bold('Composio Managed Auth Schemes:')} ${toolkit.composio_managed_auth_schemes.join(', ')}`
      );
    }
  }

  // Auth config creation fields
  if (toolkit.auth_config_details.length > 0) {
    lines.push('');
    lines.push(bold('Fields Required for AuthConfig creation:'));
    for (const detail of toolkit.auth_config_details) {
      lines.push(`  ${detail.name} (${detail.mode}):`);
      lines.push(formatFields([detail.fields.auth_config_creation]));
    }

    lines.push('');
    lines.push(bold('Fields Required for Connected Account creation:'));
    for (const detail of toolkit.auth_config_details) {
      lines.push(`  ${detail.name} (${detail.mode}):`);
      lines.push(formatFields([detail.fields.connected_account_initiation]));
    }
  }

  return lines.join('\n');
}

/**
 * View details of a specific toolkit including auth schemes and required fields.
 *
 * @example
 * ```bash
 * composio toolkits info "gmail"
 * ```
 */
export const toolkitsCmd$Info = Command.make('info', { slug }, ({ slug }) =>
  Effect.gen(function* () {
    if (!(yield* requireAuth)) return;

    const ui = yield* TerminalUI;
    const repo = yield* ComposioToolkitsRepository;

    // Missing slug guard
    if (Option.isNone(slug)) {
      yield* ui.log.warn('Missing required argument: <slug>');
      yield* ui.log.step('Try specifying a toolkit slug, e.g.:\n> composio toolkits info "gmail"');
      return;
    }

    const slugValue = slug.value;

    const toolkitOpt = yield* ui
      .withSpinner(`Fetching toolkit "${slugValue}"...`, repo.getToolkitDetailed(slugValue))
      .pipe(
        Effect.asSome,
        Effect.catchTag('services/HttpServerError', (e: HttpServerError) =>
          Effect.gen(function* () {
            // Show structured error message and suggested fix from the API
            if (e.details) {
              yield* ui.log.error(e.details.message);
              yield* ui.log.step(e.details.suggestedFix);
            } else {
              yield* ui.log.error(`Failed to fetch toolkit "${slugValue}".`);
            }

            // Try to suggest similar toolkits
            const suggestions = yield* repo.searchToolkits({ search: slugValue, limit: 3 }).pipe(
              Effect.map(r => r.items),
              Effect.catchAll(() => Effect.succeed([]))
            );

            if (suggestions.length > 0) {
              const suggestionLines = suggestions
                .map(s => `  ${s.slug} — ${s.meta.description}`)
                .join('\n');
              yield* ui.log.step(
                `Did you mean?\n${suggestionLines}\n\n> composio toolkits info "${suggestions[0]!.slug}"`
              );
            } else {
              yield* ui.log.step('Browse available toolkits:\n> composio toolkits list');
            }

            return Option.none();
          })
        )
      );

    if (Option.isNone(toolkitOpt)) {
      return;
    }

    const toolkit = toolkitOpt.value;

    yield* ui.note(formatToolkitInfo(toolkit), `Toolkit: ${toolkit.name}`);

    // Next step hint
    yield* ui.log.step(
      `To list tools in this toolkit:\n> composio tools list --toolkit "${toolkit.slug}"`
    );

    yield* ui.output(JSON.stringify(toolkit, null, 2));
  })
).pipe(Command.withDescription('View details of a specific toolkit.'));
