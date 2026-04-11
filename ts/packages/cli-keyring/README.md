# @composio/cli-keyring

Cross-platform OS credential storage for the Composio CLI.

Structurally modeled on [keyring-rs](https://github.com/open-source-cooperative/keyring-rs) (the `keyring-core` + per-platform store-crate split), but implemented as a thin shell over OS primitives so we own every byte of the execution surface and never depend on a third-party native module.

## Why this exists

Before: `~/.composio/user_data.json` held the Composio API key as a plaintext string. Any agent (Claude Code, etc.) with file-read permission could silently `Read` the file and exfiltrate the key in a single, unobservable tool call — then use it to take actions on the Composio platform.

After: the API key lives in the OS credential store (macOS Keychain / Linux Secret Service). Reading it requires either (a) an in-process call to Security.framework / D-Bus — which only the composio binary makes, and which agents cannot invoke from their own processes — or (b) shelling out to `/usr/bin/security` / `secret-tool`, which is a visible Bash tool call the user can deny. **Silent exfil becomes visible exfil**: the gate is the agent's shell-permission prompt, not a filesystem read that leaves no trace.

## Architecture

```
src/
├── core/                           # keyring-rs keyring-core port
│   ├── entry.ts                    # Entry class — (service, user, modifiers)
│   ├── errors.ts                   # KeyringError, 11-variant discriminated union
│   ├── persistence.ts              # CredentialPersistence enum
│   └── store.ts                    # CredentialStore interface + default-store registry
└── stores/                         # per-platform backends
    ├── macos-security.ts           # runtime picker (Bun → FFI, Node → subprocess)
    ├── macos-security-ffi.ts       # direct Security.framework via bun:ffi (fast path)
    ├── macos-security-subprocess.ts# /usr/bin/security subprocess fallback
    ├── linux-secret-tool.ts        # secret-tool subprocess
    ├── unsupported.ts              # Windows / BSD / … — throws NoStorageAccess
    └── shared.ts                   # subprocess helpers + base64 on-disk encoding
```

The core is intentionally Promise-based and depends on neither Effect nor any other framework. Effect-based callers (the Composio CLI) import `@composio/cli-keyring/effect` for a `KeyringService` layer.

## Backends and runtime dispatch

| platform    | runtime | backend                              | read latency |
| ----------- | ------- | ------------------------------------ | ------------ |
| macOS       | Bun     | `SecItem*` via `bun:ffi`             | **~1.4ms**   |
| macOS       | Node    | `/usr/bin/security` subprocess       | ~22ms        |
| Linux       | both    | `secret-tool` subprocess (libsecret) | ~15–40ms     |
| Windows/BSD | both    | throws `NoStorageAccess`             | —            |

The Composio CLI ships as a compiled Bun binary, so production reads always hit the FFI path. Node is the fallback for vitest-under-Node, dev tools, and anyone importing the package outside the CLI's runtime.

## Performance

Measured 100 iterations on an Apple Silicon Mac with a warm login keychain:

| operation          | subprocess | FFI (bun:ffi) | speedup |
| ------------------ | ---------- | ------------- | ------- |
| `getPassword` mean | 22.25ms    | **1.46ms**    | **15×** |
| `getPassword` p50  | 19.95ms    | **1.14ms**    | **18×** |
| `getPassword` p99  | 88.72ms    | **7.39ms**    | **12×** |
| `setPassword` mean | 26.61ms    | **16.18ms**   | 1.6×    |

For reference, the legacy plaintext read was `fs.readFileSync` + `JSON.parse` at ~0.01ms. The CLI's `ComposioUserContext` resolves the key **exactly once per process** (in-memory closure cache), so most commands pay ~1.4ms startup overhead over the plaintext baseline — well below perception, and amortized to zero for commands that do any network I/O.

## Security model

### Tagged pointers

CoreFoundation uses tagged pointers — short `CFString` and other small types pack their data directly into the pointer bits, producing values above 2^53 that cannot round-trip through JavaScript `number`. Every CF/Sec FFI type in this package is declared as `FFIType.u64` and trafficked as `bigint` to preserve full 64-bit fidelity. See the doc block at the top of `macos-security-ffi.ts` for details.

### ACL story (macOS)

Keychain items have an **Access Control List** — a per-item permission record that lists which binaries can read the item without a GUI prompt.

| ACL populated with                         | upgrade-stable?             | gates agents? |
| ------------------------------------------ | --------------------------- | ------------- |
| `[/usr/bin/security]` (subprocess default) | yes                         | no            |
| `[composio (ad-hoc signed)]`               | **no — breaks every build** | yes           |
| `[composio (Developer ID signed)]`         | yes                         | **yes**       |
| **allow-any** (current FFI choice)         | yes                         | no            |

The composio CLI is currently ad-hoc signed (`Signature=adhoc`), so a per-binary ACL would invalidate the Keychain entry on every `composio upgrade` and trigger a user dialog. To avoid that, the FFI backend builds an **allow-any** ACL (the Security.framework equivalent of `security add-generic-password -A`): `SecAccessCreate` → `SecAccessCopyACLList` → `SecACLSetSimpleContents` with `applicationList=NULL` and `selector={version=0x0101, flags=0}`. The ACL is upgrade-stable because no binary identity is recorded.

This yields the same threat model as the subprocess backend: silent file exfil becomes visible shell-tool exfil, but the OS doesn't gate reads to our binary specifically. **Upgrading to per-binary ACLs requires the composio CLI to be signed with a stable Developer ID** — that's a separate operational change (Apple Developer Program cert, notarization, CI signing step). When it lands, `buildAllowAnyAccess` gets replaced with a `buildComposioOnlyAccess` variant in a single file; no public-API churn.

### Linux

The freedesktop Secret Service API has no per-binary ACL concept at all. Any process with the same UID can read any unlocked item from the session's default collection, with zero prompting. FFI into `libsecret` would give no additional threat-model protection over the `secret-tool` subprocess — just complexity. Subprocess is the correct choice on Linux.

## On-disk encoding

Both backends base64-encode every secret before handing it to the OS and prefix the encoded string with `b64:`. Reasons:

- `security -w` takes the password on argv and cannot carry binary bytes (NUL bytes truncate; newlines break parsing).
- `secret-tool store` reads one line from stdin via `g_io_channel_read_line`, which can't carry NUL bytes or embedded newlines.
- The FFI backend stores binary-safe `CFData` directly, but encoding consistently across backends means items written by the subprocess/Node path are readable by the FFI/Bun path and vice versa.

Downside: credentials written by this package are not readable as raw bytes by other keyring-rs consumers sharing the same keychain namespace (they'd see `b64:<base64>` instead of the original value). For the CLI's API-key use case this is irrelevant — only `@composio/cli-keyring` reads them.

## Linux attribute conventions (keyring-rs interop)

When `secret-tool` creates an item, the attribute keys match keyring-rs exactly: `{service, username, target}` with `target` naming the Secret Service collection (default `"default"`). Label defaults to `keyring:{user}@{service}`. This means any other Rust tool using keyring-rs on the same system can _discover_ our items (same attribute keys, interoperable lookups), even though the stored value is our `b64:`-prefixed format.

## Usage

```ts
import { Entry, createDefaultStore, setDefaultStore } from '@composio/cli-keyring';

// One-time process startup:
setDefaultStore(await createDefaultStore());

// Anywhere:
const entry = new Entry('com.composio.cli', 'default');
await entry.setPassword(apiKey);
const stored = await entry.getPassword();
await entry.deleteCredential();
```

With Effect.ts:

```ts
import { Effect, Layer } from 'effect';
import { KeyringService, KeyringLive } from '@composio/cli-keyring/effect';

const program = Effect.gen(function* () {
  const keyring = yield* KeyringService;
  yield* keyring.setPassword('com.composio.cli', 'default', apiKey);
});

program.pipe(Effect.provide(KeyringLive));
```

## Error handling

Every operation throws `KeyringError` with a discriminated `details` field. Pattern-match on the kind, don't catch generically:

```ts
try {
  const key = await entry.getPassword();
} catch (err) {
  if (err instanceof KeyringError) {
    switch (err.kind) {
      case 'NoEntry':
        /* user not logged in yet */ break;
      case 'NoStorageAccess':
        /* keyring unavailable — fall back */ break;
      case 'BadEncoding':
        /* stored bytes aren't valid UTF-8 */ break;
      // ...
    }
  }
}
```

Full variant list (mirroring `keyring-core/src/error.rs`): `PlatformFailure`, `NoStorageAccess`, `NoEntry`, `BadEncoding`, `BadDataFormat`, `BadStoreFormat`, `TooLong`, `Invalid`, `Ambiguous`, `NoDefaultStore`, `NotSupportedByStore`.

## Integration plan (Composio CLI migration)

Tracked in a follow-up PR stacked on top of this one. Summary of the intended `ComposioUserContextLive` behavior:

### Caching (Option A: in-process memoization, no cross-process cache)

- `ComposioUserContext` resolves the API key once at layer-build time via `entry.getPassword()` and holds it in a closure variable for the remainder of the process (piggybacks on the existing `userData` single-resolve pattern — no new cache layer).
- For short-lived commands this is ~1.4ms extra startup. For the `composio execute` / `composio run` hot path it's free after the first lookup.
- **No cross-process daemon**: FFI at ~1.4ms per cold process is cheap enough that tight scripting (`composio execute` in a shell loop) stays under 140ms of keychain overhead across 100 invocations.
- **Agent threat model**: a JavaScript closure inside the composio process is unreachable to other processes on the system without `ptrace`. The key never lands in an env var, never writes to a tempfile, never hits disk.

### Fallback chain

```
login(apiKey):
  if config.dangerouslySaveApiKeyInUserConfig === true:
    → write apiKey to user_data.json.api_key (plaintext; skip keyring entirely)
  else:
    try keyring.setPassword(apiKey)
      success: write user_data.json with api_key = null
      NoStorageAccess: fall back to user_data.json.api_key + one-time warning

init (read):
  read user_data.json
  if config.dangerouslySaveApiKeyInUserConfig === true:
    → use user_data.json.api_key directly, never touch keyring
  else:
    try keyring.getPassword()
      success: use it
      NoEntry:
        if user_data.json.api_key is set (legacy):
          → use it, migrate to keyring, rewrite user_data.json with api_key = null
        else:
          → user is logged out
      NoStorageAccess:
        → fall back to user_data.json.api_key with a one-time warning

logout:
  best-effort keyring.deleteCredential()  (swallow NoEntry / NoStorageAccess)
  rewrite user_data.json with api_key = null
```

### The `dangerouslySaveApiKeyInUserConfig` escape hatch

Lives in `CliUserConfig` (`~/.composio/config.json`), alongside existing `experimentalFeatures` / `artifactDirectory` / `experimentalSubagent`. **Opt-in, not a CLI flag, not advertised in `--help`** — users who need it edit `config.json` themselves.

```json
{
  "experimental_features": {},
  "dangerously_save_api_key_in_user_config": true
}
```

Snake-case on disk (`dangerously_save_api_key_in_user_config`), camelCase in the TypeScript schema. The name follows React's `dangerouslySetInnerHTML` precedent: explicit about the risk, defaults to `false`.

**Why it exists**:

1. **Headless Linux** — no D-Bus session, `secret-tool` unavailable or unreliable in containers/CI/SSH-without-forwarding. Users who can't get the keyring working should have a clean opt-out rather than fighting `DBUS_SESSION_BUS_ADDRESS`.
2. **Docker / devcontainers / CI** — same story; ephemeral environments where the keyring is either absent or actively harmful.
3. **Power users who audit their config** — explicit opt-in with a name that makes the risk legible in `cat config.json`.

The `@composio/cli-keyring` package itself has no knowledge of this flag. The CLI's `ComposioUserContextLive` checks the flag at layer-build time and skips the keyring entirely when set. Package-CLI separation stays clean.

## Known limitations

- **macOS ACL is allow-any until Developer ID signing lands.** Subprocess-equivalent threat model: silent exfil → visible shell-tool exfil, but not per-binary gating. See the "ACL story" section above for the path to fix this.
- **Linux has no per-binary ACL at any layer** of the stack. Best achievable on Linux today is the `secret-tool` Bash-prompt gate.
- **`getAttributes` / `updateAttributes` / `search`** from keyring-rs's API surface are not implemented; they throw `NotSupportedByStore`. Add later if a caller needs them.
- **macOS non-`User` keychain domains** (System, Common, Dynamic) are not supported; modifier throws `NotSupportedByStore`.

## Running the tests

```bash
# Unit tests (Node, no keychain access)
pnpm test

# E2E against the real macOS keychain via subprocess backend (Node)
COMPOSIO_KEYRING_E2E=1 pnpm test

# E2E against the real macOS keychain via FFI backend (Bun)
COMPOSIO_KEYRING_E2E=1 bun --bun x vitest run test/ffi.test.ts
```

The E2E suites use UUID-suffixed service names so parallel runs and leftover entries from crashed runs never collide with real credentials.
