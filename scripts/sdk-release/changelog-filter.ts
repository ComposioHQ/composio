import { readFile } from 'node:fs/promises';

export function isSdkChangelog(contents: string): boolean {
  const frontmatter = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter) return false;
  return /(?:^|\n)sdkRelease\s*:\s*\S/.test(frontmatter);
}

if (import.meta.main) {
  for (const path of (await Bun.stdin.text()).split('\n').filter(Boolean)) {
    if (!isSdkChangelog(await readFile(path, 'utf8'))) console.log(path);
  }
}
