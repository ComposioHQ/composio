import type { Capability } from './capabilities';
import type { Platform } from './platforms';
import { missingCapabilities } from './platforms';
import { SkillFrontmatterSchema } from './frontmatter';
import type { SkillSpec } from './skill';

export type SkillValidationError = {
  path: string;
  message: string;
};

/**
 * Static validation that does not require a build context. Checks frontmatter
 * shape, reference slug uniqueness, and basic invariants on the spec.
 */
export const validateSkillSpec = (spec: SkillSpec): SkillValidationError[] => {
  const errors: SkillValidationError[] = [];

  const frontmatter = SkillFrontmatterSchema.safeParse(spec.frontmatter);
  if (!frontmatter.success) {
    for (const issue of frontmatter.error.issues) {
      errors.push({
        path: `frontmatter.${issue.path.join('.')}`,
        message: issue.message,
      });
    }
  }

  const referenceSlugs = new Set<string>();
  for (const reference of spec.references ?? []) {
    if (referenceSlugs.has(reference.slug)) {
      errors.push({
        path: `references[${reference.slug}]`,
        message: `duplicate reference slug "${reference.slug}"`,
      });
    }
    referenceSlugs.add(reference.slug);
  }

  const commandIds = new Set<string>();
  for (const command of spec.body?.commands ?? []) {
    if (commandIds.has(command.id)) {
      errors.push({
        path: `body.commands[${command.id}]`,
        message: `duplicate command id "${command.id}"`,
      });
    }
    commandIds.add(command.id);
  }

  return errors;
};

/**
 * Check declared capabilities against a concrete target platform. This is the
 * hard compatibility gate — if the target cannot satisfy a capability, return
 * it so the caller can fail fast rather than silently drop features.
 */
export const checkCapabilitySupport = (
  platform: Platform,
  declared: readonly Capability[]
): Capability[] => missingCapabilities(platform, declared);
