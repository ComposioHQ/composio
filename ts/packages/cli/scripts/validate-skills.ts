import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildComposioCliSkill, renderComposioCliSkill } from '../skills-src/composio-cli/index';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-skill-validate-'));

try {
  const stableDir = buildComposioCliSkill({
    channel: 'stable',
    outputRoot: path.join(tempRoot, 'stable'),
  });
  const betaDir = buildComposioCliSkill({
    channel: 'beta',
    outputRoot: path.join(tempRoot, 'beta'),
  });

  const stableSkill = fs.readFileSync(path.join(stableDir, 'SKILL.md'), 'utf8');
  const betaSkill = fs.readFileSync(path.join(betaDir, 'SKILL.md'), 'utf8');

  if (!stableSkill.includes('<!-- release-channel: stable -->')) {
    throw new Error('Stable skill output is missing its release channel marker.');
  }

  if (!betaSkill.includes('<!-- release-channel: beta -->')) {
    throw new Error('Beta skill output is missing its release channel marker.');
  }

  if (stableSkill.includes('### Beta Path')) {
    throw new Error('Stable skill output unexpectedly includes beta-only content.');
  }

  if (!betaSkill.includes('### Beta Path')) {
    throw new Error('Beta skill output is missing beta-only content.');
  }

  if (stableSkill !== renderComposioCliSkill('stable')) {
    throw new Error('Stable skill build is not reproducible from the renderer.');
  }

  if (betaSkill !== renderComposioCliSkill('beta')) {
    throw new Error('Beta skill build is not reproducible from the renderer.');
  }

  for (const relativePath of [
    'agents/openai.yaml',
    'references/composio-dev.md',
    'references/power-user-examples.md',
    'references/troubleshooting.md',
  ]) {
    if (!fs.existsSync(path.join(stableDir, relativePath))) {
      throw new Error(`Stable build is missing ${relativePath}`);
    }
    if (!fs.existsSync(path.join(betaDir, relativePath))) {
      throw new Error(`Beta build is missing ${relativePath}`);
    }
  }

  console.log('Validated composio-cli skill builds for stable and beta.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
