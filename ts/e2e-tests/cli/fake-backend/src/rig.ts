/**
 * A CLI rig: one fake Composio deployment and one journey container whose
 * `composio` binary is pointed at it for every host it knows. Other outbound
 * traffic from the container is not blocked.
 */

import { startJourneyContainer, type E2ETestResult, type JourneyContainer } from '@e2e-tests/utils';
import type { JourneyExecOptions } from '@e2e-tests/utils';
import type { JournalEntry } from './journal';
import { startFakeComposio, type FakeComposio } from './server';
import { USER_API_KEY } from './world';

/** Where the fake Dashboard's certificate lives inside the container. */
export const CA_CERT_PATH = '/etc/composio-e2e/fake-ca.pem';

export interface RigOptions {
  /** Short name for the container, shown in `docker ps`. */
  label?: string;
  /**
   * `false` leaves `COMPOSIO_WEB_URL` unset, which keeps consumer executions on
   * the backend instead of the Dashboard. Defaults to `true`, the production path.
   */
  dashboard?: boolean;
  /** Extra environment for every command, applied over the rig's own. */
  env?: Record<string, string>;
}

export interface CommandResult extends E2ETestResult {
  /** What the fake received while the command ran, in arrival order. */
  readonly requests: ReadonlyArray<JournalEntry>;
}

export interface CliRig {
  readonly fake: FakeComposio;
  readonly journey: JourneyContainer;
  /** Runs a command line in the container and collects the requests it caused. */
  run(command: string, options?: JourneyExecOptions): Promise<CommandResult>;
  /** Stores the seeded user API key the way `composio login --user-api-key` does. */
  login(): Promise<CommandResult>;
  stop(): Promise<void>;
}

/**
 * The environment that keeps the binary hermetic: every host it knows is the
 * fake, telemetry is off, and the fake Dashboard's certificate is trusted.
 */
export const hermeticEnv = (
  fake: FakeComposio,
  options: Pick<RigOptions, 'dashboard'> = {}
): Record<string, string> => ({
  ...fake.cliEnv({ dashboard: options.dashboard }),
  COMPOSIO_CLI_TELEMETRY_DISABLED: '1',
  NODE_EXTRA_CA_CERTS: CA_CERT_PATH,
});

export const startCliRig = async (options: RigOptions = {}): Promise<CliRig> => {
  const fake = await startFakeComposio();
  let journey: JourneyContainer;
  try {
    journey = await startJourneyContainer({
      label: options.label,
      env: { ...hermeticEnv(fake, options), ...options.env },
    });
    await journey.writeFile(CA_CERT_PATH, fake.caCert);
  } catch (error) {
    await fake.close();
    throw error;
  }

  const run: CliRig['run'] = async (command, execOptions) => {
    const mark = fake.journal.mark();
    const result = await journey.exec(command, execOptions);
    return { ...result, requests: fake.journal.since(mark) };
  };

  return {
    fake,
    journey,
    run,
    login: async () => {
      const result = await run(`composio login --user-api-key ${USER_API_KEY} --no-skill-install`);
      if (result.exitCode !== 0) {
        throw new Error(
          `Rig login failed (exit ${result.exitCode})\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
        );
      }
      return result;
    },
    stop: async () => {
      await journey.stop();
      await fake.close();
    },
  };
};
