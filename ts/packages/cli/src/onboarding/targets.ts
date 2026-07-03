import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillInstallTarget } from 'src/effects/install-skill';

export type OnboardingTarget = {
  readonly id: SkillInstallTarget;
  readonly label: string;
  readonly markerDirectory: string;
};

export const ONBOARDING_TARGETS: ReadonlyArray<OnboardingTarget> = [
  { id: 'claude', label: 'Claude Code', markerDirectory: '.claude' },
  { id: 'codex', label: 'Codex', markerDirectory: '.codex' },
  { id: 'cursor', label: 'Cursor', markerDirectory: '.cursor' },
  { id: 'dust', label: 'Dust', markerDirectory: '.dust' },
  { id: 'openclaw', label: 'OpenClaw', markerDirectory: '.openclaw' },
];

const SKILL_INSTALL_TARGETS = ONBOARDING_TARGETS.map(target => target.id);

export const isSkillInstallTarget = (value: string): value is SkillInstallTarget =>
  (SKILL_INSTALL_TARGETS as ReadonlyArray<string>).includes(value);

export const formatSkillInstallTargetList = (): string => SKILL_INSTALL_TARGETS.join('|');

export const targetLabel = (target: SkillInstallTarget): string =>
  ONBOARDING_TARGETS.find(candidate => candidate.id === target)?.label ?? target;

export const detectOnboardingTargets = (home: string): ReadonlyArray<OnboardingTarget> =>
  ONBOARDING_TARGETS.filter(target => fs.existsSync(path.join(home, target.markerDirectory)));

export const parseTargetList = (value: string): ReadonlyArray<SkillInstallTarget> => {
  const targets = value
    .split(',')
    .map(target => target.trim().toLowerCase())
    .filter(Boolean);
  const invalid = targets.filter(target => !isSkillInstallTarget(target));
  if (invalid.length > 0) {
    throw new Error(
      `Unsupported onboarding target${invalid.length === 1 ? '' : 's'}: ${invalid.join(', ')}. Expected: ${SKILL_INSTALL_TARGETS.join(', ')}.`
    );
  }
  return [...new Set(targets)] as ReadonlyArray<SkillInstallTarget>;
};
