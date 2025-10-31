/**
 * Alias manager for pnpm. 
 */
function readPackage(pkg, context) {
  /**
   * Alias zod-to-json-schema to @finom/zod-to-json-schema, to work around this issue:
   * https://github.com/StefanTerdell/zod-to-json-schema/issues/178.
   */
  if (pkg.dependencies && pkg.dependencies['zod-to-json-schema']) {
    pkg.dependencies['zod-to-json-schema'] = 'npm:@finom/zod-to-json-schema@3.24.11'
    context.log(`zod-to-json-schema => @finom/zod-to-json-schema in dependencies of ${pkg.name}`)
  }
  return pkg
}

module.exports = {
  hooks: {
    readPackage
  }
}
