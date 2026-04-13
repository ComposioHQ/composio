import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildComposioCliSkill, type SkillReleaseChannel } from '../skills-src/composio-cli/index';

const args = process.argv.slice(2);

const readArg = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const channelArg = readArg('--channel') ?? 'stable';
if (channelArg !== 'stable' && channelArg !== 'beta') {
  throw new Error(`Invalid --channel value "${channelArg}". Expected "stable" or "beta".`);
}

const outputDirArg = readArg('--output-dir') ?? path.resolve(process.cwd(), 'dist/skills');
const outputDir = path.resolve(process.cwd(), outputDirArg);
const channel = channelArg as SkillReleaseChannel;

fs.mkdirSync(outputDir, { recursive: true });
const skillDir = buildComposioCliSkill({ channel, outputRoot: outputDir });

console.log(`Built composio-cli skill for ${channel} at ${skillDir}`);
