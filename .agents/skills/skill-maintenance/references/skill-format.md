# Skill Format

## Canonical Tree

- `.agents/skills` is canonical.
- `.claude/skills` is a compatibility symlink to `.agents/skills`.
- Do not maintain parallel hand-edited skill copies.

## Required Structure

Each skill directory must contain `SKILL.md` with YAML frontmatter:

```yaml
---
name: skill-name
description: What the skill does and when to use it.
---
```

Rules:

- `name` must match the directory name.
- Use lowercase letters, digits, and hyphens only.
- Include trigger boundaries in `description`; it is the routing surface agents see before loading the body.
- Keep `SKILL.md` short. Put detailed examples, command recipes, and package-specific notes in first-level `references/*.md`.
- Link every reference directly from `SKILL.md`; avoid nested reference-chasing.
- Do not add `agents/openai.yaml` unless repo tooling explicitly needs UI metadata.

## Primary Sources Checked

- OpenAI Codex Agent Skills docs: skills are directories with `SKILL.md`, optional `scripts/`, `references/`, `assets/`, and optional `agents/`.
- Claude Agent Skills docs: every skill requires `SKILL.md` frontmatter with `name` and `description`.
- VS Code Agent Skills docs: `name` should match the parent directory and use lowercase hyphenated identifiers.

## Validation

Run:

```bash
pnpm validate:agent-skills
pnpm validate:skill-routing
```

`validate:agent-skills` checks frontmatter, names, reference links, compatibility symlink state, stale guidance references, and known command names.

`validate:skill-routing` is a deterministic routing smoke test (`ts/scripts/test-skill-routing.mjs`): for representative tasks it asserts the expected skill is the unique top match by distinctive trigger phrases, and fails if any skill has no probe. When you add or rename a skill, or rewrite a `description`, add or update its probe so routing stays covered.
