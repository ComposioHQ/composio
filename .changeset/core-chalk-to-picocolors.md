---
'@composio/core': patch
---

Replace `chalk` with `picocolors` for colored error and log output. The two render identically, but `picocolors` is a fraction of the size (~0.8 kB gzipped vs chalk's much larger footprint), shrinking the bundled package.
