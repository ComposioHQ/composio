import * as fs from 'node:fs';
import * as path from 'node:path';
import { Effect } from 'effect';
import { NodeOs } from 'src/services/node-os';
import type { SkillInstallTarget } from 'src/effects/install-skill';

export type OnboardingTarget = {
  readonly id: SkillInstallTarget;
  readonly label: string;
  readonly markerPath: string;
};

export const ONBOARDING_TARGETS: ReadonlyArray<{
  readonly id: SkillInstallTarget;
  readonly label: string;
  readonly marker: (home: string) => string;
}> = [
  { id: 'claude', label: 'Claude Code', marker: home => path.join(home, '.claude') },
  { id: 'codex', label: 'Codex', marker: home => path.join(home, '.codex') },
  { id: 'cursor', label: 'Cursor', marker: home => path.join(home, '.cursor') },
  { id: 'dust', label: 'Dust', marker: home => path.join(home, '.dust') },
  { id: 'openclaw', label: 'OpenClaw', marker: home => path.join(home, '.openclaw') },
];

export const isSkillInstallTarget = (value: string): value is SkillInstallTarget =>
  ONBOARDING_TARGETS.some(target => target.id === value);

export const formatSkillInstallTargetList = (): string =>
  ONBOARDING_TARGETS.map(target => target.id).join('|');

export const targetLabel = (target: SkillInstallTarget): string =>
  ONBOARDING_TARGETS.find(item => item.id === target)?.label ?? target;

export const detectOnboardingTargets = Effect.gen(function* () {
  const os = yield* NodeOs;
  const home = os.homedir;

  return ONBOARDING_TARGETS.flatMap(target => {
    const markerPath = target.marker(home);
    return fs.existsSync(markerPath)
      ? [{ id: target.id, label: target.label, markerPath } satisfies OnboardingTarget]
      : [];
  });
});

export const parseTargetList = (
  raw: string | undefined,
  detected: ReadonlyArray<OnboardingTarget>
): ReadonlyArray<OnboardingTarget> => {
  if (!raw?.trim()) {
    return detected;
  }

  const requested = raw
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  const requestedSet = new Set(requested);
  return detected.filter(target => requestedSet.has(target.id));
};
