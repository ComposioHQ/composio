---
'@composio/anthropic': patch
---

Harden the Anthropic tool property-key sanitizer:

- **Prototype-safe key restoration.** Reverse-mapping lookups and the rebuilt argument object are now prototype-free, so a tool call whose arguments use a key matching an `Object.prototype` member (`__proto__`, `constructor`, `toString`, `hasOwnProperty`, …) no longer throws or silently corrupts the payload sent to the backend. `Object.prototype` is never mutated.
- **Depth cap.** Schema sanitization and key restoration now bound recursion (matching core's JSON-schema walker) so a pathologically deep schema or argument object fails with a clear error instead of overflowing the stack.
- **Empty / all-illegal keys.** A property key that is empty (or made entirely of stripped characters) now becomes a deterministic non-empty alias instead of an empty string, which would itself have violated Anthropic's `{1,64}` length bound.
- **Collision loop.** Replaced a latent non-terminating fixed point in the alias collision resolver with a counter that always makes progress.
