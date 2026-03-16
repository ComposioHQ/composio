/**
 * Alias manager for pnpm. 
 */
function readPackage(pkg, context) {
  if (pkg.dependencies) {
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
