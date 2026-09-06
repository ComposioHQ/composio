# v0 to v1 Migration and Deprecation Strategy

## Decision

We make the jump to 1.0 a staged transition, not a cliff. The breaking changes the 1.0 contract requires (provider renames, removed deprecations, the neutral error-code prefix, the broad name audit) land behind warnings first and behind alias bridges second, so a user upgrades on their own schedule and never hits an unannounced break.

The shape, in order:

1. A final 0.x release deprecates everything that will change and warns at the point of use, naming the replacement.
2. 1.0 makes the cut. Renamed and moved APIs keep deprecated alias bridges through the whole 1.x line and are removed at 2.0. APIs removed with no replacement are deleted at 1.0, because they were already deprecated in 0.x and warned again in the final release, and there is nothing to forward them to.
3. A codemod, a migration doc page, a `v1-migration` agent skill, and a docs version selector carry the user across.

## Problem

The 1.0 contract is worth real breaking changes, and the audit listed them: rename `@composio/google` to `@composio/gemini`, remove roughly 29 deprecated TypeScript APIs, change the error prefix from `TS-SDK::` to `COMPOSIO::`, and align method names across the two SDKs. A naive 1.0 ships all of that at once, and every user who upgrades hits a wall of breakage with no warning. We want the clean 1.0 surface and a gentle path to it. Those goals only conflict if the cut is a single step, so we stage it.

## The staged transition

### Final 0.x: deprecate and warn

Before 1.0 we ship a last 0.x release whose only job is to warn. Every API that 1.0 will remove or rename is marked deprecated, with a message that names the replacement: a TypeScript `@deprecated` annotation that surfaces in editors and a Python `DeprecationWarning` raised once per process. The new error codes ship here too, added alongside the old ones, so handlers can move to `COMPOSIO::` codes before the old prefix goes away. A user who upgrades through this release sees, in their own editor and logs, exactly what will break and what to switch to.

### 1.0: make the cut, keep bridges for renames

At 1.0 the deprecated surface is gone from the stable contract, with one softening rule. Anything that was renamed or moved keeps a deprecated alias that forwards to the new name, and that alias lives through the entire 1.x line. `@composio/google` keeps working as a deprecated re-export of `@composio/gemini` until 2.0; a renamed method keeps a forwarding shim until 2.0. The aliases are cheap insurance: `@composio/google` is about 5.6k downloads a month, and a forwarding re-export costs us almost nothing to carry.

Removals are treated differently from renames. An API that is going away with no replacement, such as the OpenAI Assistants helpers on `OpenAIProvider` or `ComposioError`'s `exitProcess`/`exitCode` options, has nothing to forward to, so it is deleted at 1.0 rather than kept as a throwing stub. It was deprecated in 0.x and warned again in the final release, which is the runway it gets.

One removal does not fit either bucket cleanly: `connected_accounts.initiate()` for managed OAuth. Its replacement is `link()`, so it reads like a rename, but the backend endpoint hard-retires on a fixed date (2026-07-03 for all orgs) regardless of which SDK version a user runs, so a forwarding alias would start erroring the moment the server cuts it off. We treat it as a server-driven retirement, not a normal rename: the final 0.x already raises a `DeprecationWarning` pointing at `link()`, 1.0 migrates every doc and example to `link()`, and the method is removed once the backend cutover completes rather than carried as a bridge that cannot keep working.

### 2.0: remove the bridges

The alias bridges are removed at 2.0, on the deprecation schedule the stability contract defines. By then a user has had the entire 1.x line, with editor and runtime warnings the whole way, to move off the old names.

## Tooling

Warnings are necessary but not sufficient, so four things carry the user across the gap.

- **A codemod** handles the mechanical renames. Because the name audit changes identifiers broadly, most of the migration is find-and-rewrite, and a codemod (jscodeshift for TypeScript, with a documented equivalent for Python) lets a user apply the bulk of it in one command instead of by hand.
- **A `v1-migration` agent skill** under `.agents/skills/` guides coding agents through the upgrade. Agents are how a large share of this code gets written and changed, so the migration has to be legible to them, not only to humans reading a doc.
- **A dedicated migration doc page**, one consolidated "Upgrading to 1.0" guide per language, is the human entry point. It pairs each removed or renamed API with its replacement and points at the codemod.
- **A docs version selector** lets the site serve v0 and v1 content side by side, so a user still on 0.x reads the docs that match their version instead of docs for an API they do not have yet.

## Deprecation policy this sets for the future

The transition rules generalize into the policy the stability contract references. Within the 1.x line a stable API can be deprecated but not removed; a deprecation names its replacement and warns at the point of use; the earliest removal is the next major. Renames carry a forwarding alias for at least a full major. Experimental APIs are exempt and can change in any minor. The 0.x-to-1.0 transition is the first application of this policy, not a special case.

## Considered alternatives

- **A hard cutover at 1.0 with no aliases.** Rejected. It is the cleanest surface and the worst upgrade: every renamed import breaks at once with nothing to forward it, and the codemod alone cannot cover users who upgrade without running it.
- **Permanent aliases that never get removed.** Rejected. They would freeze the old names into the contract forever and defeat the rename. A bridge that ends at 2.0 gives users a long, bounded window without making the old name permanent.
- **Throwing stubs for removed-with-no-replacement APIs, kept until 2.0.** Rejected for APIs with no replacement: a stub that only throws adds surface to maintain and points nowhere. The 0.x warning is the runway; at 1.0 the API is gone.

## FAQ

**How long does a user have to migrate?** The full 0.x final release plus the entire 1.x line for anything renamed. Warnings start before 1.0 and the bridges last until 2.0.

**Why delete some APIs at 1.0 but bridge others?** A rename has a destination to forward to, so a bridge is cheap and useful. A removal has no destination, so a bridge would only throw, which is worse than a clean deletion that the user was warned about in 0.x.

**Is the codemod required to upgrade?** No. It handles the mechanical renames in one pass, but the aliases mean code that is not run through the codemod still works through 1.x, with deprecation warnings pointing the way.
