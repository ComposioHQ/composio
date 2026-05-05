# Local tool binary assets

Platform-specific executable and dynamic-library assets for first-party local tool integrations live under this directory.

The reusable foundation PR intentionally does not include concrete app binaries. Follow-up toolkit integrations should place files here and reference them from `bundledBinaries` declarations by relative path. The CLI binary build scripts copy this directory next to packaged CLI artifacts so command and FFI tools can resolve them at runtime.

When an integration vendors native binaries, keep the source reproducible with a pinned git submodule under `ts/packages/cli-local-tools/vendor/` plus a package script that rebuilds the sidecar assets from that submodule. For example, Beeper iMessage binaries are rebuilt from `vendor/platform-imessage` with:

```bash
pnpm --filter @composio/cli-local-tools build:beeper-imessage
```
