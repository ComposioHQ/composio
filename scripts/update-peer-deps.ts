/**
 * This script updates the peer dependencies of all toolsets to the latest version of the core package.
 * It reads the core package version from the core package's package.json file.
 */

import fs from 'fs';
import path from 'path';

const corePkgPackageJson = path.resolve(__dirname, '../packages/core', 'package.json');
const corePkg = JSON.parse(fs.readFileSync(corePkgPackageJson, 'utf-8'));
const coreVersion = corePkg.version;

// skip if the core package is rc, alpha or beta
if (coreVersion.includes('rc') || coreVersion.includes('alpha') || coreVersion.includes('beta')) {
  console.log(`✅ Current core version is ${coreVersion}`);
  console.log(
    '⚠️ Skipping update of peer dependencies for rc, alpha or beta versions of the core package'
  );
  process.exit(0);
}

const toolsetsDir = path.resolve(__dirname, '../packages/toolsets');
const toolsetDirs = fs.readdirSync(toolsetsDir).filter(name => {
  const fullPath = path.resolve(toolsetsDir, name);
  return fs.existsSync(path.join(fullPath, 'package.json'));
});

for (const toolset of toolsetDirs) {
  const toolsetPackageJson = path.resolve(toolsetsDir, toolset, 'package.json');
  const toolsetPkg = JSON.parse(fs.readFileSync(toolsetPackageJson, 'utf-8'));
  toolsetPkg.peerDependencies['@composio/core'] = `^${coreVersion}`;
  fs.writeFileSync(toolsetPackageJson, JSON.stringify(toolsetPkg, null, 2));
  console.log(
    `✅ Updated peer dependency for ${toolset} from ${toolsetPkg.peerDependencies['@composio/core']} -> ^${coreVersion}`
  );
}
