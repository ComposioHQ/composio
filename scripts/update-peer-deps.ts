/**
 * This script updates the peer dependencies of all providers to the latest version of the core package.
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

const providersDir = path.resolve(__dirname, '../packages/providers');
const providerDirs = fs.readdirSync(providersDir).filter(name => {
  const fullPath = path.resolve(providersDir, name);
  return fs.existsSync(path.join(fullPath, 'package.json'));
});

for (const provider of providerDirs) {
  const providerPackageJson = path.resolve(providersDir, provider, 'package.json');
  const providerPkg = JSON.parse(fs.readFileSync(providerPackageJson, 'utf-8'));
  providerPkg.peerDependencies['@composio/core'] = `^${coreVersion}`;
  fs.writeFileSync(providerPackageJson, JSON.stringify(providerPkg, null, 2));
  console.log(
    `✅ Updated peer dependency for ${provider} from ${providerPkg.peerDependencies['@composio/core']} -> ^${coreVersion}`
  );
}
