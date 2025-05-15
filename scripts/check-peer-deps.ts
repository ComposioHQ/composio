import fs from 'fs';
import path from 'path';
import semver from 'semver';

const corePkgPackageJson = path.resolve(__dirname, '../packages/core/package.json');
const toolsetsDir = path.resolve(__dirname, '../packages/toolsets');

const corePkg = JSON.parse(fs.readFileSync(corePkgPackageJson, 'utf-8'));
const coreVersion = corePkg.version;

const toolsetDirs = fs.readdirSync(toolsetsDir).filter(name => {
  const fullPath = path.resolve(toolsetsDir, name);
  return fs.existsSync(path.join(fullPath, 'package.json'));
});

let hasError = false;

for (const dir of toolsetDirs) {
  const pkgPath = path.resolve(toolsetsDir, dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  const peerDeps = pkg.peerDependencies || {};
  const declaredCoreVersion = peerDeps['@composio/core'];

  if (!declaredCoreVersion) {
    console.error(`[ERROR] Toolset ${dir} does not declare @composio/core as a peerDependency`);
    hasError = true;
    continue;
  }

  if (!semver.satisfies(coreVersion, declaredCoreVersion)) {
    console.error(
      `[ERROR] Toolset ${dir} declares incompatible core version range: ${declaredCoreVersion} (current: ${coreVersion})`
    );
    hasError = true;
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log('✅ All toolsets declare compatible @composio/core peerDependencies.');
}
