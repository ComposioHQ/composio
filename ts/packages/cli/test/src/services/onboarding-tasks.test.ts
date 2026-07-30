import { describe, expect, it } from 'vitest';
import { Option } from 'effect';
import {
  ONBOARD_TASKS,
  findTaskByFreeText,
  findTaskByToolkit,
  onboardToolkitSlugs,
} from 'src/services/onboarding-tasks';

describe('onboarding-tasks', () => {
  describe('findTaskByToolkit', () => {
    it('returns the github entry for an exact slug', () => {
      const task = findTaskByToolkit('github');
      expect(Option.isSome(task)).toBe(true);
      expect(Option.getOrThrow(task).id).toBe('check-my-github');
    });

    it('matches case-insensitively', () => {
      expect(Option.getOrThrow(findTaskByToolkit('GitHub')).toolkit).toBe('github');
    });

    it('returns none for a non-curated toolkit', () => {
      expect(findTaskByToolkit('hubspot')).toStrictEqual(Option.none());
    });

    it('returns none for the empty string', () => {
      expect(findTaskByToolkit('')).toStrictEqual(Option.none());
      expect(findTaskByToolkit('   ')).toStrictEqual(Option.none());
    });
  });

  describe('findTaskByFreeText', () => {
    it('matches a label substring', () => {
      expect(Option.getOrThrow(findTaskByFreeText('read my latest')).id).toBe('read-my-inbox');
    });

    it('matches every registry id exactly', () => {
      for (const task of ONBOARD_TASKS) {
        expect(Option.getOrThrow(findTaskByFreeText(task.id))).toStrictEqual(task);
      }
    });

    it('returns none for text matching no entry', () => {
      expect(findTaskByFreeText('do a thing')).toStrictEqual(Option.none());
    });

    it('returns none for the empty string rather than matching every label', () => {
      expect(findTaskByFreeText('')).toStrictEqual(Option.none());
      expect(findTaskByFreeText('  ')).toStrictEqual(Option.none());
    });
  });

  describe('registry invariants', () => {
    it('has a unique id per entry', () => {
      const ids = ONBOARD_TASKS.map(task => task.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('has a unique toolkit per entry', () => {
      const toolkits = ONBOARD_TASKS.map(task => task.toolkit);
      expect(new Set(toolkits).size).toBe(toolkits.length);
    });

    it('prefixes every read slug with its toolkit, uppercased', () => {
      for (const task of ONBOARD_TASKS) {
        expect(task.read.slug.startsWith(`${task.toolkit.toUpperCase()}_`)).toBe(true);
      }
    });

    it('uses lowercase toolkit slugs so exact lookup is stable', () => {
      for (const task of ONBOARD_TASKS) {
        expect(task.toolkit).toBe(task.toolkit.toLowerCase());
      }
    });

    it('gives every create entry a confirm label, required args, and a distinct slug', () => {
      for (const task of ONBOARD_TASKS) {
        if (task.create === undefined) {
          continue;
        }
        expect(task.create.confirmLabel.length).toBeGreaterThan(0);
        expect(task.create.requiredArgs.length).toBeGreaterThan(0);
        expect(task.create.slug).not.toBe(task.read.slug);
        expect(task.create.slug.startsWith(`${task.toolkit.toUpperCase()}_`)).toBe(true);
      }
    });

    it('carries no default value on any required create argument', () => {
      // A defaulted `owner`/`repo` would write into someone else's repository, so the shape
      // must offer nothing to fall back to when a prompt is unanswered.
      for (const task of ONBOARD_TASKS) {
        for (const arg of task.create?.requiredArgs ?? []) {
          expect(Object.keys(arg)).not.toContain('defaultValue');
          expect(Object.keys(arg)).not.toContain('default');
          expect(arg.key.length).toBeGreaterThan(0);
          expect(arg.prompt.length).toBeGreaterThan(0);
        }
      }
    });

    it('has a unique key per required create argument', () => {
      for (const task of ONBOARD_TASKS) {
        const keys = (task.create?.requiredArgs ?? []).map(arg => arg.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    });

    it('returns undefined from every summarize given an empty payload', () => {
      for (const task of ONBOARD_TASKS) {
        expect(task.read.summarize?.({})).toBeUndefined();
        expect(task.create?.summarize?.({})).toBeUndefined();
      }
    });

    it('exposes the curated slugs in registry order', () => {
      expect(onboardToolkitSlugs()).toStrictEqual(ONBOARD_TASKS.map(task => task.toolkit));
    });
  });

  describe('summarize', () => {
    it('summarizes a github profile from either payload shape', () => {
      const github = Option.getOrThrow(findTaskByToolkit('github'));
      expect(github.read.summarize?.({ login: 'jkomyno' })).toContain('jkomyno');
      expect(github.read.summarize?.({ data: { login: 'jkomyno' } })).toContain('jkomyno');
    });

    it('summarizes a gmail fetch by message count', () => {
      const gmail = Option.getOrThrow(findTaskByToolkit('gmail'));
      expect(gmail.read.summarize?.({ data: { messages: [1, 2, 3] } })).toContain('3');
    });

    it('returns undefined when the expected field has the wrong type', () => {
      const gmail = Option.getOrThrow(findTaskByToolkit('gmail'));
      expect(gmail.read.summarize?.({ messages: 'three' })).toBeUndefined();
    });
  });
});
