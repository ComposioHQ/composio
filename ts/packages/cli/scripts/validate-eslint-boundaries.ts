// Guards the CLI's Effect platform boundaries: every eslint-disable comment in
// src/ must be a single-line `eslint-disable-next-line` with a `-- reason`
// justification, and must be registered in eslint-boundaries.json. The manifest
// pins an exact per-file, per-rule count, so adding a disable anywhere fails
// this check until the manifest is regenerated on purpose (see AGENTS.md,
// "Effect Boundary Policy").
//
// Usage:
//   tsx ./scripts/validate-eslint-boundaries.ts            # verify (CI)
//   tsx ./scripts/validate-eslint-boundaries.ts --update   # regenerate manifest
import * as fs from 'node:fs';
import * as path from 'node:path';

const scriptDir = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
const packageRoot = path.resolve(scriptDir, '..');
const srcRoot = path.join(packageRoot, 'src');
const manifestPath = path.join(packageRoot, 'eslint-boundaries.json');

type Manifest = Record<string, Record<string, number>>;

const NEXT_LINE_FORM = /\/\/ eslint-disable-next-line (?<rules>[\w@/,\- ]+?) -- (?<reason>.+)$/;

const listSourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });

const errors: string[] = [];
const found: Manifest = {};

for (const file of listSourceFiles(srcRoot).sort()) {
  const relative = path.relative(packageRoot, file).split(path.sep).join('/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, index) => {
    if (!line.includes('eslint-disable')) return;

    const location = `${relative}:${index + 1}`;
    const match = NEXT_LINE_FORM.exec(line);
    if (!match?.groups) {
      errors.push(
        `${location}: only "// eslint-disable-next-line <rules> -- <reason>" is allowed ` +
          '(no file-wide disables, no bare disables without a justification).'
      );
      return;
    }

    for (const rule of match.groups.rules.split(',').map(rule => rule.trim())) {
      const perFile = (found[relative] ??= {});
      perFile[rule] = (perFile[rule] ?? 0) + 1;
    }
  });
}

if (process.argv.includes('--update')) {
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    console.error('\nFix the malformed disables above before regenerating the manifest.');
    process.exit(1);
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(found, null, 2)}\n`);
  console.log(
    `Wrote ${path.relative(packageRoot, manifestPath)} (${Object.keys(found).length} files).`
  );
  process.exit(0);
}

const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const [file, rules] of Object.entries(found)) {
  for (const [rule, count] of Object.entries(rules)) {
    const allowed = manifest[file]?.[rule] ?? 0;
    if (count > allowed) {
      errors.push(
        `${file}: ${count}x "${rule}" found, ${allowed} registered. New eslint-disables are not ` +
          'allowed in CLI src: thread the @effect/platform service (Path, FileSystem), effect/Config, ' +
          'or Either.try instead — see "Effect Boundary Policy" in ts/packages/cli/AGENTS.md. If this ' +
          'is genuinely a new runtime boundary, regenerate the manifest with ' +
          '`pnpm run validate:boundaries -- --update` and justify the boundary in your PR.'
      );
    }
  }
}

for (const [file, rules] of Object.entries(manifest)) {
  for (const [rule, allowed] of Object.entries(rules)) {
    const count = found[file]?.[rule] ?? 0;
    if (count < allowed) {
      errors.push(
        `${file}: manifest registers ${allowed}x "${rule}" but only ${count} exist. ` +
          'Nice — a boundary went away. Regenerate the manifest with `pnpm run validate:boundaries -- --update`.'
      );
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(
  `eslint boundaries OK: ${Object.values(found).reduce(
    (sum, rules) => sum + Object.values(rules).reduce((a, b) => a + b, 0),
    0
  )} registered disables across ${Object.keys(found).length} files.`
);
