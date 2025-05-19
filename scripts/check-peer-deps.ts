import fs from 'fs';
import path from 'path';
import semver from 'semver';

const corePkgPackageJson = path.resolve(__dirname, '../packages/core/package.json');
const providersDir = path.resolve(__dirname, '../packages/providers');

const corePkg = JSON.parse(fs.readFileSync(corePkgPackageJson, 'utf-8'));
const coreVersion = corePkg.version;

const providerDirs = fs.readdirSync(providersDir).filter(name => {
  const fullPath = path.resolve(providersDir, name);
  return fs.existsSync(path.join(fullPath, 'package.json'));
});

let hasError = false;

for (const dir of providerDirs) {
  const pkgPath = path.resolve(providersDir, dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  const peerDeps = pkg.peerDependencies || {};
  const declaredCoreVersion = peerDeps['@composio/core'];

  if (!declaredCoreVersion) {
    console.error(`[ERROR] Provider ${dir} does not declare @composio/core as a peerDependency`);
    hasError = true;
    continue;
  }

  if (!semver.satisfies(coreVersion, declaredCoreVersion)) {
    console.error(
      `[ERROR] Provider ${dir} declares incompatible core version range: ${declaredCoreVersion} (current: ${coreVersion})`
    );
    hasError = true;
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log('✅ All providers declare compatible @composio/core peerDependencies.');
}
