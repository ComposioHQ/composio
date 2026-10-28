import { Console, Effect, Layer } from 'effect';
import {
  ComposioToolkitsRepository,
  type ComposioToolkitsRepositoryShape,
} from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import * as MockConsole from '../services/mock-console';
import { makeToolkitsRepositoryStub } from '../services/toolkits-repository-stub';
import {
  authConfigRepositoryMethods,
  resolveAuthConfigsTestData,
  type AuthConfigsTestData,
} from './connected-accounts';
import { terminalUITestImpl } from '../services/terminal-ui-test';

/** What an `auth-configs` handler test serves. */
export interface AuthConfigsHandlerFixture {
  /** The auth configs the repository answers from, as `TestLive` serves them. */
  readonly authConfigsData?: AuthConfigsTestData;
  /** Repository methods that answer differently, such as a failing request. */
  readonly repository?: Partial<ComposioToolkitsRepositoryShape>;
}

/**
 * What an `auth-configs` handler needs without argv or `TestLive`: a headless terminal whose
 * stdout payloads land in `outputs` (decoration goes to `MockConsole`), and a repository
 * serving only the auth-config methods. Any other repository method dies.
 */
export const AuthConfigsHandlerTest = (fixture: AuthConfigsHandlerFixture = {}) => {
  const outputs: Array<string> = [];
  const layer = Layer.mergeAll(
    Layer.effect(Console.Console, MockConsole.make),
    Layer.succeed(
      TerminalUI,
      TerminalUI.of({
        ...terminalUITestImpl,
        output: data =>
          Effect.sync(() => {
            outputs.push(data);
          }),
      })
    ),
    Layer.succeed(
      ComposioToolkitsRepository,
      makeToolkitsRepositoryStub({
        // Only the auth-config methods: a stray connected-account request dies instead of
        // answering a catchable API error, so a test fails loudly at the change site.
        ...authConfigRepositoryMethods(resolveAuthConfigsTestData(fixture.authConfigsData)),
        ...fixture.repository,
      })
    )
  );
  return { layer, outputs };
};
