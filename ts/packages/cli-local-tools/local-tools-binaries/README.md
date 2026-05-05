# Local tool binary assets

Platform-specific executable and dynamic-library assets for first-party local tool integrations live under this directory.

The reusable foundation PR intentionally does not include concrete app binaries. Follow-up toolkit integrations should place files here and reference them from `bundledBinaries` declarations by relative path. The CLI binary build scripts copy this directory next to packaged CLI artifacts so command and FFI tools can resolve them at runtime.
