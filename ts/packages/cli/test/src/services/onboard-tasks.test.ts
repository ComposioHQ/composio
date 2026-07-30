import { describe, expect, it } from '@effect/vitest';
import {
  findOnboardTaskByToolkit,
  findOnboardTaskForConnectedToolkits,
  matchOnboardTask,
  ONBOARD_TASKS,
} from 'src/services/onboard-tasks';

describe('ONBOARD_TASKS registry', () => {
  it('contains only managed-OAuth tasks', () => {
    for (const task of ONBOARD_TASKS) {
      expect(task.authType).toBe('oauth');
    }
  });

  it('declares a demo kind for every task', () => {
    for (const task of ONBOARD_TASKS) {
      expect(['read', 'reversible_create']).toContain(task.demo.kind);
      expect(task.demo.toolSlugHint.length).toBeGreaterThan(0);
      expect(task.demo.sampleArgs).toBeTypeOf('object');
    }
  });

  it('has unique ids and toolkits', () => {
    const ids = ONBOARD_TASKS.map(task => task.id);
    const toolkits = ONBOARD_TASKS.map(task => task.toolkit);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(toolkits).size).toBe(toolkits.length);
  });

  it('uses lowercase toolkit slugs', () => {
    for (const task of ONBOARD_TASKS) {
      expect(task.toolkit).toBe(task.toolkit.toLowerCase());
    }
  });
});

describe('demo summarize (human execute output)', () => {
  const github = findOnboardTaskByToolkit('github')!;

  it('summarizes the github profile read into a one-liner', () => {
    expect(github.demo.summarize?.({ login: 'KJ-11', name: 'Kshitij' })).toBe(
      "You're @KJ-11 (Kshitij)"
    );
    expect(github.demo.summarize?.({ data: { login: 'octocat' } })).toBe("You're @octocat");
    expect(github.demo.summarize?.({ irrelevant: true })).toBeUndefined();
  });

  it('summarizes the github create into an issue line with url', () => {
    expect(
      github.followUpCreate?.summarize?.({
        number: 7,
        title: 'test',
        html_url: 'https://github.com/acme/app/issues/7',
      })
    ).toBe("Created issue #7 'test' → https://github.com/acme/app/issues/7");
    expect(github.followUpCreate?.summarize?.({ no_number: true })).toBeUndefined();
  });

  it('every curated read demo has a summarizer', () => {
    for (const task of ONBOARD_TASKS) {
      expect(task.demo.summarize, task.toolkit).toBeTypeOf('function');
    }
  });

  it('summarizes list-shaped reads (gmail/slack/linear/notion)', () => {
    expect(
      findOnboardTaskByToolkit('gmail')!.demo.summarize?.({
        messages: [{ subject: 'Hi' }, { subject: 'Yo' }],
      })
    ).toBe("Fetched 2 emails (latest: 'Hi')");
    expect(findOnboardTaskByToolkit('slack')!.demo.summarize?.({ channels: [{}, {}, {}] })).toBe(
      '3 channels'
    );
    expect(findOnboardTaskByToolkit('linear')!.demo.summarize?.({ issues: { nodes: [{}] } })).toBe(
      '1 issue assigned'
    );
    expect(findOnboardTaskByToolkit('notion')!.demo.summarize?.({ results: [{}, {}] })).toBe(
      '2 pages'
    );
  });
});

describe('demo tool args (small payloads)', () => {
  it('gmail demo carries a small max_results limit', () => {
    const gmail = findOnboardTaskByToolkit('gmail')!;
    expect(gmail.demo.sampleArgs.max_results).toBe(3);
  });

  it('every list-returning demo passes a small page-size / limit arg', () => {
    const limitKeys = ['max_results', 'limit', 'first', 'page_size'];
    // the github profile read returns a single object; the other four return lists
    for (const toolkit of ['gmail', 'slack', 'linear', 'notion']) {
      const args = findOnboardTaskByToolkit(toolkit)!.demo.sampleArgs;
      const limit = limitKeys.map(key => args[key]).find(value => typeof value === 'number');
      expect(limit, `${toolkit} demo args: ${JSON.stringify(args)}`).toBeTypeOf('number');
      expect(limit as number, toolkit).toBeLessThanOrEqual(10);
    }
  });
});

describe('followUpCreate (opt-in reversible create)', () => {
  it('is present only on tasks with a natural reversible-create', () => {
    const withCreate = ONBOARD_TASKS.filter(task => task.followUpCreate).map(task => task.toolkit);
    expect(withCreate.sort()).toEqual(['github', 'linear']);
  });

  it('keeps the primary demo a read while the follow-up is a reversible_create', () => {
    for (const task of ONBOARD_TASKS) {
      if (!task.followUpCreate) continue;
      expect(task.demo.kind).toBe('read');
      expect(task.followUpCreate.kind).toBe('reversible_create');
    }
  });

  it('declares a create tool and at least one required arg with a prompt', () => {
    for (const task of ONBOARD_TASKS) {
      const followUp = task.followUpCreate;
      if (!followUp) continue;
      expect(followUp.toolSlugHint.length).toBeGreaterThan(0);
      expect(followUp.requiredArgs.length).toBeGreaterThan(0);
      for (const arg of followUp.requiredArgs) {
        expect(arg.key.length).toBeGreaterThan(0);
        expect(arg.prompt.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('findOnboardTaskByToolkit', () => {
  it('matches case-insensitively and trims', () => {
    expect(findOnboardTaskByToolkit('GitHub ')?.id).toBe('github_profile');
    expect(findOnboardTaskByToolkit('gmail')?.toolkit).toBe('gmail');
  });

  it('returns undefined for non-curated toolkits', () => {
    expect(findOnboardTaskByToolkit('salesforce')).toBeUndefined();
  });
});

describe('matchOnboardTask', () => {
  it('matches free text mentioning a curated toolkit', () => {
    expect(matchOnboardTask('read my Gmail inbox')?.toolkit).toBe('gmail');
    expect(matchOnboardTask('something with github please')?.toolkit).toBe('github');
  });

  it('returns undefined for unrelated text and empty input', () => {
    expect(matchOnboardTask('order a pizza')).toBeUndefined();
    expect(matchOnboardTask('   ')).toBeUndefined();
  });

  it('does not bind on incidental substrings of a toolkit name', () => {
    expect(matchOnboardTask('notional ideas')).toBeUndefined();
    expect(matchOnboardTask('nonlinear workflow')).toBeUndefined();
    expect(matchOnboardTask('githubbed together')).toBeUndefined();
  });

  it('matches whole-word toolkit mentions with surrounding punctuation', () => {
    expect(matchOnboardTask('search my notion, please')?.toolkit).toBe('notion');
    expect(matchOnboardTask('list linear-issues')?.toolkit).toBe('linear');
  });
});

describe('findOnboardTaskForConnectedToolkits', () => {
  it('picks the first curated task among connected toolkits', () => {
    expect(findOnboardTaskForConnectedToolkits(['slack', 'gmail'])?.toolkit).toBe('gmail');
    expect(findOnboardTaskForConnectedToolkits(['SLACK'])?.toolkit).toBe('slack');
  });

  it('returns undefined when nothing matches', () => {
    expect(findOnboardTaskForConnectedToolkits(['salesforce'])).toBeUndefined();
    expect(findOnboardTaskForConnectedToolkits([])).toBeUndefined();
  });
});
