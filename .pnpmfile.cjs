/**
 * Alias manager for pnpm. 
 */
function readPackage(pkg, context) {
  /**
   * Alias zod-to-json-schema to @finom/zod-to-json-schema, to work around this issue:
   * https://github.com/StefanTerdell/zod-to-json-schema/issues/178.
   */
  if (pkg.dependencies) {
    if ('zod-to-json-schema' in pkg.dependencies) {
      pkg.dependencies['zod-to-json-schema'] = 'npm:@finom/zod-to-json-schema@3.24.11'
      context.log(`zod-to-json-schema => @finom/zod-to-json-schema in dependencies of ${pkg.name}`)
    }

    // Note: you can use this to alias `@composio/client` to a preview Stainless package URL for local testing.
    // if ('@composio/client' in pkg.dependencies) {
    //   const url = 'https://pkg.stainless.com/s/composio-sdk-typescript/4a53e1ae40ca5a0a3479727eb59d2512110c81cc'
    //   pkg.dependencies['@composio/client'] = url
    //   context.log(`@composio/client => ${url} in dependencies of ${pkg.name}`)
    // }
  }

  return pkg
}

module.exports = {
  hooks: {
    readPackage
  }
}
