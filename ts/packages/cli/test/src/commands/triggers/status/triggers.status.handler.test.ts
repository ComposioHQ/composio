import type { TriggerInstanceListActiveParams } from '@composio/client/resources/trigger-instances';
import { describe, expect, it } from '@effect/vitest';
import { Console, Effect, Layer, Option } from 'effect';
import {
  runTriggersStatus,
  type TriggersStatusParams,
} from 'src/commands/triggers/status/triggers.status.handler';
import type { TriggerInstanceItem } from 'src/models/triggers';
import { ComposioToolkitsRepository } from 'src/services/composio-clients';
import { TerminalUI } from 'src/services/terminal-ui';
import { MockConsole } from 'test/__utils__';
import { notFoundError } from 'test/__utils__/layers/not-found';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { terminalUITestImpl } from 'test/__utils__/services/terminal-ui-test';
import { makeToolkitsRepositoryStub } from 'test/__utils__/services/toolkits-repository-stub';

const trigger = (id: string, triggerName: string): TriggerInstanceItem => ({
  id,
  uuid: `uuid-${id}`,
  trigger_name: triggerName,
  connected_account_id: `ca_${id}`,
  auth_config_id: `ac_${id}`,
  user_id: 'user_1',
  disabled_at: null,
  updated_at: '2026-02-01T00:00:00Z',
  trigger_data: '',
  state: {},
  trigger_config: {},
});

const GMAIL = trigger('trg_gmail', 'GMAIL_NEW_GMAIL_MESSAGE');
const SLACK = trigger('trg_slack', 'SLACK_NEW_MESSAGE');

const noFilters: TriggersStatusParams = {
  userIds: Option.none(),
  connectedAccountIds: Option.none(),
  toolkits: Option.none(),
  triggerIds: Option.none(),
  triggerNames: Option.none(),
  showDisabled: false,
  limit: 30,
};

interface TriggersStatusFixture {
  readonly items?: ReadonlyArray<TriggerInstanceItem>;
  /** The API's `total_items`, which can exceed the page it returned. */
  readonly totalItems?: number;
  readonly fails?: boolean;
}

/**
 * What `runTriggersStatus` reads: a repository whose `listActiveTriggers` records its params
 * and answers one page, and a headless terminal whose stdout data lands in `outputs`.
 */
const triggersStatusTest = (fixture: TriggersStatusFixture = {}) => {
  const outputs: Array<string> = [];
  const requests: Array<TriggerInstanceListActiveParams> = [];
  const items = [...(fixture.items ?? [GMAIL, SLACK])];

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
        listActiveTriggers: params =>
          Effect.suspend(() => {
            requests.push(params);
            return fixture.fails
              ? Effect.fail(notFoundError('no trigger instances'))
              : Effect.succeed({
                  items,
                  total_items: fixture.totalItems ?? items.length,
                  total_pages: 1,
                  current_page: 1,
                  next_cursor: null,
                });
          }),
      })
    )
  );
  return { layer, outputs, requests };
};

const stderr = MockConsole.getLines({ stream: 'stderr', stripAnsi: true });
const allLines = MockConsole.getLines({ stripAnsi: true });

describe('runTriggersStatus', () => {
  it.effect('[Given] no filters [Then] requests active triggers only, with no id filters', () => {
    const { layer, requests } = triggersStatusTest();
    return Effect.gen(function* () {
      yield* runTriggersStatus(noFilters);

      expect(requests).toEqual([
        {
          user_ids: undefined,
          connected_account_ids: undefined,
          trigger_ids: undefined,
          trigger_names: undefined,
          show_disabled: false,
          limit: 30,
        },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] every id filter [Then] splits each on commas and uppercases trigger names',
    () => {
      const { layer, requests } = triggersStatusTest();
      return Effect.gen(function* () {
        yield* runTriggersStatus({
          ...noFilters,
          userIds: Option.some('user_1, user_2'),
          connectedAccountIds: Option.some('ca_1,ca_2'),
          triggerIds: Option.some('ti_1'),
          triggerNames: Option.some('gmail_new_gmail_message,Slack_New_Message'),
          showDisabled: true,
        });

        expect(requests).toEqual([
          {
            user_ids: ['user_1', 'user_2'],
            connected_account_ids: ['ca_1', 'ca_2'],
            trigger_ids: ['ti_1'],
            trigger_names: ['GMAIL_NEW_GMAIL_MESSAGE', 'SLACK_NEW_MESSAGE'],
            show_disabled: true,
            limit: 30,
          },
        ]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect.each([
    { limit: 0, expected: 1 },
    { limit: 1001, expected: 1000 },
  ])('[Given] limit $limit [Then] requests $expected triggers', ({ limit, expected }) => {
    const { layer, requests } = triggersStatusTest();
    return Effect.gen(function* () {
      yield* runTriggersStatus({ ...noFilters, limit });

      expect(requests.map(request => request.limit)).toEqual([expected]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('[Given] no toolkit filter [Then] reports the API total and prints the page', () => {
    const { layer, outputs } = triggersStatusTest({ totalItems: 42 });
    return Effect.gen(function* () {
      yield* runTriggersStatus(noFilters);

      expect((yield* allLines).join('\n')).toContain('Listing 2 of 42 triggers');
      expect(outputs).toHaveLength(1);
      expect(JSON.parse(outputs[0] ?? '[]')).toEqual([
        {
          id: 'trg_gmail',
          uuid: 'uuid-trg_gmail',
          trigger_name: 'GMAIL_NEW_GMAIL_MESSAGE',
          toolkit_slug: 'gmail',
          user_id: 'user_1',
          connected_account_id: 'ca_trg_gmail',
          status: 'ACTIVE',
          disabled_at: null,
          updated_at: '2026-02-01T00:00:00Z',
        },
        {
          id: 'trg_slack',
          uuid: 'uuid-trg_slack',
          trigger_name: 'SLACK_NEW_MESSAGE',
          toolkit_slug: 'slack',
          user_id: 'user_1',
          connected_account_id: 'ca_trg_slack',
          status: 'ACTIVE',
          disabled_at: null,
          updated_at: '2026-02-01T00:00:00Z',
        },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] a toolkit filter [Then] keeps matching triggers and reports the page size as total',
    () => {
      const { layer, outputs, requests } = triggersStatusTest({ totalItems: 42 });
      return Effect.gen(function* () {
        yield* runTriggersStatus({ ...noFilters, toolkits: Option.some('SLACK') });

        expect(requests[0]).not.toHaveProperty('toolkits');
        expect((yield* allLines).join('\n')).toContain('Listing 1 of 2 triggers');
        expect(JSON.parse(outputs[0] ?? '[]')).toMatchObject([{ id: 'trg_slack' }]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('[Given] an empty toolkit filter [Then] applies no toolkit filter', () => {
    const { layer } = triggersStatusTest({ totalItems: 42 });
    return Effect.gen(function* () {
      yield* runTriggersStatus({ ...noFilters, toolkits: Option.some(' , ') });

      expect((yield* allLines).join('\n')).toContain('Listing 2 of 42 triggers');
    }).pipe(Effect.provide(layer));
  });

  it.effect.each([
    { showDisabled: false, message: 'No active triggers found for the provided filters.' },
    { showDisabled: true, message: 'No triggers found for the provided filters.' },
  ])(
    '[Given] nothing matches and showDisabled $showDisabled [Then] warns and outputs nothing',
    ({ showDisabled, message }) => {
      const { layer, outputs } = triggersStatusTest({ items: [] });
      return Effect.gen(function* () {
        yield* runTriggersStatus({ ...noFilters, showDisabled });

        expect(outputs).toEqual([]);
        expect(yield* stderr).toEqual([message]);
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect('[Given] a toolkit filter no trigger matches [Then] warns and outputs nothing', () => {
    const { layer, outputs } = triggersStatusTest();
    return Effect.gen(function* () {
      yield* runTriggersStatus({ ...noFilters, toolkits: Option.some('github') });

      expect(outputs).toEqual([]);
      expect(yield* stderr).toEqual(['No active triggers found for the provided filters.']);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    '[Given] the API fails [Then] reports the fallback message, outputs nothing and exits 1',
    () => {
      const { layer, outputs } = triggersStatusTest({ fails: true });
      return Effect.gen(function* () {
        const exit = yield* Effect.exit(runTriggersStatus(noFilters));

        expect(outputs).toEqual([]);
        expect(exitCodeOf(exit)).toBe(1);
        expect(yield* stderr).toContain('Failed to fetch trigger status.');
        expect((yield* allLines).join('\n')).toContain(
          'Retry with:\n> composio dev triggers status --show-disabled'
        );
      }).pipe(Effect.provide(layer));
    }
  );
});
