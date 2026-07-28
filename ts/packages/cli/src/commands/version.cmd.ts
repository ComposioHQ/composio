import { Command, Options } from '@effect/cli';
import { Effect } from 'effect';
import { getVersion } from 'src/effects/version';
import {
  getFreshnessReport,
  type ArtifactStatus,
  type FreshnessArtifacts,
} from 'src/services/artifact-freshness';
import { TerminalUI } from 'src/services/terminal-ui';
import { bold, cyanBright } from 'src/ui/colors';

const check = Options.boolean('check').pipe(
  Options.withDescription(
    'Check every Composio artifact (CLI binary, agent skill, Claude Code and Codex plugins) ' +
      'for a newer release and print a machine-readable JSON freshness report ' +
      '({current, latestStable, updateAvailable, checkStatus, lastChecked, artifacts}). ' +
      'Refreshes the CLI release cache when it is older than 24 hours.'
  )
);

const ARTIFACT_LABELS: Record<Exclude<keyof FreshnessArtifacts, 'cli'>, string> = {
  skill: 'Composio agent skill',
  claudePlugin: 'Composio Claude Code plugin',
  codexPlugin: 'Composio Codex plugin',
};

function staleArtifactLine(label: string, artifact: ArtifactStatus): string | undefined {
  if (!artifact.updateAvailable || artifact.latest === null) return undefined;
  let from = '';
  if (artifact.current !== null) {
    from = `${artifact.current} → `;
  }
  return `${label} update available: ${from}${bold(cyanBright(artifact.latest))}`;
}

/**
 * CLI command to display the version of the Composio CLI.
 *
 * @example
 * ```bash
 * composio version
 * composio version --check
 * ```
 */
export const versionCmd = Command.make('version', { check }).pipe(
  Command.withDescription('Display the current Composio CLI version.'),
  Command.withHandler(({ check }) =>
    Effect.gen(function* () {
      const ui = yield* TerminalUI;

      if (check) {
        const report = yield* getFreshnessReport;
        if (report.updateAvailable && report.latestStable) {
          yield* ui.log.info(
            `Update available: ${report.current} → ${bold(cyanBright(report.latestStable))} — run ${cyanBright('composio upgrade')}`
          );
        } else if (report.checkStatus === 'unknown') {
          yield* ui.log.warn('Unable to determine the latest stable Composio CLI release.');
        } else {
          yield* ui.log.info(`${report.current} is up to date.`);
        }
        for (const [key, label] of Object.entries(ARTIFACT_LABELS)) {
          const line = staleArtifactLine(
            label,
            report.artifacts[key as keyof typeof ARTIFACT_LABELS]
          );
          if (line !== undefined) {
            yield* ui.log.info(line);
          }
        }
        yield* ui.output(JSON.stringify(report));
        return;
      }

      const version = yield* getVersion;
      yield* ui.log.info(version);
      yield* ui.output(version);

      yield* Effect.logDebug('Composio CLI version command executed successfully.');
    })
  )
);
