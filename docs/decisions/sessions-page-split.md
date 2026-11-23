# Sessions page split proposals

## Decision

Brendan approved option 1 on 2026-11-22: give each task its own page and put Saved session policies next to Restrict tool access. The implementation uses the nine flat pages in option 1 and updates both the content metadata and Platform sidebar.

The original alternatives and complete content mapping below record the choice. Options 2 and 3 are not implemented. The former overview and configuration URLs retain short bookmark pages outside navigation, linking every old section anchor to its new task page. Saved session policies moves with permanent redirects for HTML and Markdown URLs.

The reader-facing name describes a reusable access policy. The SDK and API still call the object a Session config. Keep `sessionConfigId`, `session_config_id`, `composio.sessionConfigs`, `sourceSessionConfig`, API object names, endpoints, and Dashboard **Sessions → Configs** unchanged. A saved policy is separate from a live session's `session.config` snapshot.

### Overview follow-up, 2026-11-23

Palash requested an overview linking to every Sessions task, reached by clicking the **Sessions** folder header rather than a separate **What is a session?** child. The folder now uses its native Fumadocs index link, with eight task pages beneath it. The existing index page is titled **Sessions overview** and adds a task directory.

Pending Brendan's decisions, the conceptual content and existing URLs, anchors, and inbound links have not been removed or rewritten. The page previously labeled **What is a session?** already lives at `/docs/sessions`; it has no separate task URL in this PR. Its pre-split URL, `/docs/how-composio-works`, still serves the existing bookmark map.

Open questions for Brendan:

- How much conceptual content should remain on the overview: all current sections, only the definition and diagram, or a short introduction with task links?
- Should the legacy `/docs/how-composio-works` URL redirect to the overview, or keep its bookmark map? Should remaining inbound links be updated? If overview content is shortened, where should the existing section bookmarks lead?

## Content and navigation before the split

Inspected at `9ae6a8ed13eec5647c31b4dbb38d41dbe3b1eb5f` on `next`:

| Source under `docs/content/docs/` | Current title                              | Scope                                                                                                                                           |
| --------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `how-composio-works.mdx`          | What is a session?                         | 276 lines. Concepts, create/read tools, execution results and input requests, persistence, reuse, and a short update example.                   |
| `configuring-sessions.mdx`        | Configuring Sessions                       | 1,666 lines. Creation, access filters, tool loading, connections, sandbox options, updates, methods, and catalog lookup. This is the long page. |
| `session-configs.mdx`             | Saved session policies, renamed in this PR | 144 lines. Read and apply a named policy, limits, provenance, and failures.                                                                     |
| `sessions-via-mcp.mdx`            | Using sessions via MCP                     | Hosted session endpoint, exported credentials, approval fallback, framework wiring, and transport limitations.                                  |
| `extending-sessions/meta.json`    | Extend sessions                            | Proxy execute, Local tools and toolkits, Shared connections, Custom MCP.                                                                        |

The actual Core concepts order in `content/docs/meta.json` is:

```text
What is a session?       how-composio-works
Apps and toolkits        apps-and-toolkits/
Configuring Sessions    configuring-sessions
Saved session policies  session-configs
Instant Tools           instant-tools
Toolkits                toolkits
Authentication          authentication/
Triggers                triggers
Skills                  skills
```

The relevant Guides entries are **Using sessions via MCP**, **Sandboxes**, **Extend sessions**, and **Set up triggers**. Nearby folders use `meta.json` with a `title` and an ordered `pages` array. Sandboxes and Extend sessions also use `defaultOpen: false`. Authentication has `index.mdx` for its landing page, while Extend sessions has no landing page. Page titles supply sidebar labels through the docs source loader; `session-configs` has no label override in the root metadata.

For every alternative, add `content/docs/sessions/meta.json` with `title: Sessions`, `defaultOpen: false`, and explicit page order matching its tree. Use `index.mdx` for `/docs/sessions`. Replace the current `how-composio-works` entry with `sessions`, remove `configuring-sessions`, and keep **Apps and toolkits** immediately after the folder. Remove the top-level `session-configs` entry only in options 1 and 3. Leave every other root entry in its current order. Titles and slugs below are proposed, not existing routes.

## Option 1: task pages, approved

Keep the folder one level deep. A reader can choose the task without deciding whether it belongs in configuration or reference.

```text
Core concepts
├─ Sessions/
│  ├─ What is a session?       /docs/sessions                    index.mdx
│  ├─ Create and reuse         /docs/sessions/create-and-reuse
│  ├─ Restrict tool access     /docs/sessions/tool-access
│  ├─ Saved session policies   /docs/sessions/saved-session-policies
│  ├─ Load tools               /docs/sessions/loading-tools
│  ├─ Select connections       /docs/sessions/connections
│  ├─ Set sandbox options      /docs/sessions/sandbox-settings
│  ├─ Update a session         /docs/sessions/updating-sessions
│  └─ Execute session tools    /docs/sessions/executing-tools
├─ Apps and toolkits          /docs/apps-and-toolkits
└─ Instant Tools, Toolkits, Authentication, Triggers, Skills unchanged
```

Saved session policies sits beside inline tool restrictions because it replaces the same toolkit, tool, and tag fields. Its full contents move together, including applying a policy on update. Update a session links to that section rather than repeating it.

This gives a reader configuring Gmail access, selecting a work account, or fixing a conflicting update a specific destination. Presets and preloading stay together, and update replacement/null/concurrency rules stay together. The cost is nine child pages and more links when a task combines access, tool loading, and connections. Method examples are distributed by task, so API-name lookup relies on links to the SDK reference rather than a single methods list.

Redirects would send `/docs/how-composio-works` to `/docs/sessions`, `/docs/configuring-sessions` to `/docs/sessions/create-and-reuse`, and `/docs/session-configs` to `/docs/sessions/saved-session-policies`. The first two need the hash compatibility treatment below. The policy page keeps every existing section heading, so its hashes can survive a path redirect.

## Option 2: fewer topic pages

Keep the overview intact and divide the configuration page into four broad topics. Keep the saved policy as a root sibling because a saved definition is reusable across sessions, whereas these pages configure and operate one live session.

```text
Core concepts
├─ Sessions/
│  ├─ What is a session?       /docs/sessions                    index.mdx
│  ├─ Access policy            /docs/sessions/access-policy
│  ├─ Runtime settings         /docs/sessions/runtime-settings
│  ├─ Update a session         /docs/sessions/updating-sessions
│  └─ Session methods          /docs/sessions/session-methods
├─ Apps and toolkits          /docs/apps-and-toolkits
├─ Saved session policies     /docs/session-configs
└─ Instant Tools, Toolkits, Authentication, Triggers, Skills unchanged
```

Access policy links to Saved session policies as the alternative to inline filters. The saved page keeps its existing URL and all its content. Its proximity in Core concepts makes the distinction visible, but readers expanding Sessions will not find it among the children.

This is the smallest folder and preserves the methods list for someone looking up `authorize()` or `delete()`. A reader can inspect toolkit, tool, tag, approval, and catalog rules on one page. Runtime settings still combines presets, preload, auth, account selection, and sandbox settings, roughly 540 source lines including creation. That page remains substantial, and the overview retains its existing execution and update examples. A reader fixing an execution error still starts on the overview rather than a task-specific page.

Redirect `/docs/how-composio-works` to `/docs/sessions` with its headings intact. Redirect `/docs/configuring-sessions` to `/docs/sessions/runtime-settings`, with hash compatibility for sections moved elsewhere. `/docs/session-configs` needs no redirect.

## Option 3: separate guides, configuration, and reference

Make the difference between doing a task and looking up rules explicit. Keep named policies inside the configuration folder, beside the inline access policy they replace.

```text
Core concepts
├─ Sessions/
│  ├─ What is a session?       /docs/sessions                    index.mdx
│  ├─ Create and reuse         /docs/sessions/create-and-reuse
│  ├─ Execute session tools    /docs/sessions/executing-tools
│  ├─ Configuration/           meta title: Configuration
│  │  ├─ Access policy         /docs/sessions/configuration/access-policy
│  │  ├─ Saved session policies /docs/sessions/configuration/saved-session-policies
│  │  ├─ Tool loading          /docs/sessions/configuration/tool-loading
│  │  ├─ Connections           /docs/sessions/configuration/connections
│  │  └─ Sandbox settings      /docs/sessions/configuration/sandbox-settings
│  └─ Reference/               meta title: Reference
│     ├─ Update semantics      /docs/sessions/reference/update-semantics
│     ├─ Session methods       /docs/sessions/reference/session-methods
│     └─ Catalog lookup        /docs/sessions/reference/catalog
├─ Apps and toolkits          /docs/apps-and-toolkits
└─ Instant Tools, Toolkits, Authentication, Triggers, Skills unchanged
```

The nested folders would each have an explicit `meta.json` and `defaultOpen: false`, with no landing page, following Extend sessions. There are eleven content pages. A reader debugging map replacement can open Update semantics, while a reader wiring an execution loop can open Execute session tools. Method signatures remain together. The cost is two extra folder choices and a boundary between update guidance and the short `update()` method example. The main SDK/API references already provide detailed signatures, so this has more navigation and maintenance than the current content needs.

Redirect `/docs/how-composio-works` to `/docs/sessions`, `/docs/configuring-sessions` to `/docs/sessions/configuration/access-policy`, and `/docs/session-configs` to `/docs/sessions/configuration/saved-session-policies`. Overview and configuration hashes need compatibility handling. All saved-policy section hashes remain unchanged.

## Complete content mapping

Each row moves its entire source section, including descendant headings, prose, tables, code tabs, callouts, version requirements, markers, and links. An exception is explicit in the row. Do not drop examples or copy a section to multiple destinations. Existing short examples that overlap longer examples remain mapped here; any later consolidation needs a separate semantic review.

Paths in the destination columns are relative to `/docs/sessions/`. `index` means `/docs/sessions`. `S` means the complete saved-policy page, at the location specified in that option's tree.

### From Configuring Sessions

Source headings below are the current headings, including the retained API term “Session config.”

| Current heading/content                                                                               | Carry with the section                                                                                                                                                                                                  | Option 1                  | Option 2            | Option 3                         |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------- | -------------------------------- |
| Creating a session; API key permissions                                                               | All three language tabs, unrestricted default, local-tool link, identity-header warning, management versus execution permissions                                                                                        | `create-and-reuse`        | `runtime-settings`  | `create-and-reuse`               |
| Using a saved Session config                                                                          | Short link to S, relabeled Saved session policies                                                                                                                                                                       | `tool-access`             | `access-policy`     | `configuration/access-policy`    |
| Reading and updating session configuration                                                            | Returned API types, `instant`, `premium_usage`, approval-only entries, `proxy_execute`, Python attribute access, required TS `config` member                                                                            | `updating-sessions`       | `updating-sessions` | `reference/update-semantics`     |
| Requiring tool approval                                                                               | Experimental scope table, approval-only lists do not restrict availability, input-required errors and continuation, MCP fallback link                                                                                   | `tool-access`             | `access-policy`     | `configuration/access-policy`    |
| Enabling toolkits; Disabling toolkits; Denying every app toolkit                                      | Array/object forms, omitted versus empty enable/disable, meta-tool independence, SDK minimums, unknown root-key rejection                                                                                               | `tool-access`             | `access-policy`     | `configuration/access-policy`    |
| Direct tools preset; Enable selected meta tools                                                       | Native and API preset equivalents, default meta-tool disablement, supported groups that can be re-enabled, output examples                                                                                              | `loading-tools`           | `runtime-settings`  | `configuration/tool-loading`     |
| Enabling or disabling specific tools                                                                  | Enable, shorthand, and disable examples, per-action enforcement link and its exclusions                                                                                                                                 | `tool-access`             | `access-policy`     | `configuration/access-policy`    |
| Filtering tools by tags; Overriding for a toolkit                                                     | Allow/block/approval, toolkit tag replacement, explicit tool filters overriding global tags                                                                                                                             | `tool-access`             | `access-policy`     | `configuration/access-policy`    |
| Preloading tools                                                                                      | Tools returned natively and over MCP, fewer-than-20 guidance, SDK minimums, multi-account restriction, local preload link, `all` shortcut                                                                               | `loading-tools`           | `runtime-settings`  | `configuration/tool-loading`     |
| Custom auth configs; Account selection; Precedence                                                    | All examples, array preference/string compatibility, single-account limit, five-step precedence, newest connection, account troubleshooting link                                                                        | `connections`             | `runtime-settings`  | `configuration/connections`      |
| Disabling the sandbox; Sandbox compute tier                                                           | Removed tools/prompts, HTTP 400, ZDR boundary, proxy restriction link, `workbench` alias/wire name, tier table and defaults, SDK minimums, pricing caveat, restart and persistent mount semantics                       | `sandbox-settings`        | `runtime-settings`  | `configuration/sandbox-settings` |
| Updating a session                                                                                    | Omitted fields preserved, refresh only on success, API example, SDK minimums                                                                                                                                            | `updating-sessions`       | `updating-sessions` | `reference/update-semantics`     |
| Maps replace, they don't merge                                                                        | Stored before/after JSON, full-map resubmission, empty map, policy replacement versus subfield merge                                                                                                                    | `updating-sessions`       | `updating-sessions` | `reference/update-semantics`     |
| Narrowing an existing session to no app toolkits; Removing a callback URL; Clearing a block with null | All examples, unchecked-API marker, empty allowlist versus null, callback empty-string rejection, every nullable block, access widening and multi-account defaults                                                      | `updating-sessions`       | `updating-sessions` | `reference/update-semantics`     |
| Blocks you can set only on update                                                                     | Search/execute defaults, connection-removal setting, server experimental fields versus local creation fields, S conflict/link                                                                                           | `updating-sessions`       | `updating-sessions` | `reference/update-semantics`     |
| Multi-account mode after an update; Preload must stay inside the policy                               | Canonical disabled state, invalid combinations, atomic policy/preload validation and example                                                                                                                            | `updating-sessions`       | `updating-sessions` | `reference/update-semantics`     |
| Concurrent updates                                                                                    | Last-writer default, version precondition, unsupported-API 400, conflict errors, no SDK retry/cache/history mutation on 409, reread/retry examples, unchecked-API marker, explicit false, history-to-request conversion | `updating-sessions`       | `updating-sessions` | `reference/update-semantics`     |
| Session methods introduction                                                                          | Provider and MCP links become related links on every destination receiving a method below                                                                                                                               | method destinations below | `session-methods`   | `reference/session-methods`      |
| tools()                                                                                               | Provider formatting, meta-tool default, all examples                                                                                                                                                                    | `loading-tools`           | `session-methods`   | `reference/session-methods`      |
| executeMeta() / execute_meta()                                                                        | Accepted slug type, result type, input-required errors, no retries, third/fourth arguments, backend execution excludes in-process local tools                                                                           | `executing-tools`         | `session-methods`   | `reference/session-methods`      |
| authorize(); toolkits()                                                                               | OAuth redirect/wait, authentication link, connection-status display, connected filter, popularity order, default 20 and cursor examples                                                                                 | `connections`             | `session-methods`   | `reference/session-methods`      |
| update(); Configuration history                                                                       | Short update examples, link to full semantics, newest/live-first history, version configs, flags, cursor fields, limit 100                                                                                              | `updating-sessions`       | `session-methods`   | `reference/session-methods`      |
| delete()                                                                                              | All examples, immediate unavailability, returned ID, missing/deleted 404, SDK minimums                                                                                                                                  | `create-and-reuse`        | `session-methods`   | `reference/session-methods`      |
| Browsing the catalog                                                                                  | Dashboard/docs catalog, toolkit/tool list examples, raw schema lookup without user context, `getMany`/`get_many`                                                                                                        | `tool-access`             | `access-policy`     | `reference/catalog`              |
| Next                                                                                                  | Existing Sandbox card                                                                                                                                                                                                   | `sandbox-settings`        | `runtime-settings`  | `configuration/sandbox-settings` |

### From What is a session?

| Current heading/content                                                              | Carry with the section                                                                                                                                                                                                                            | Option 1           | Option 2 | Option 3           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------- | ------------------ |
| Opening definition and managed-auth-only link; What comes in a session               | Defaults and skill guidance, architecture diagram, links to configuration, authentication and sandbox                                                                                                                                             | `index`            | `index`  | `index`            |
| The basics                                                                           | Creation and tools examples in all three tabs; four-item scope list moves with it                                                                                                                                                                 | `create-and-reuse` | `index`  | `create-and-reuse` |
| Users; Authentication                                                                | Stable IDs and isolation warning, multi-account link, authorize versus in-chat auth, persisted connections, managed versus custom apps                                                                                                            | `index`            | `index`  | `index`            |
| Tools and Toolkits; Meta tools                                                       | Definitions, unrestricted default, local-tools link, SessionFlow, shared context, direct-preset link                                                                                                                                              | `index`            | `index`  | `index`            |
| Executing session tools; Reading execution results; Handling requests for user input | `session.execute()` examples, direct-execution warning, provider routing, complete envelope table, `resultType` versus `successful`, Instant charges, custom session contract, continuation state/decline/cancel rules, Google/Cloudflare helpers | `executing-tools`  | `index`  | `executing-tools`  |
| Sandbox                                                                              | Conceptual explanation and remote sandbox link                                                                                                                                                                                                    | `index`            | `index`  | `index`            |
| How sessions behave                                                                  | New IDs, no expiry, reuse examples, short update examples, user/task boundary, preserved workbench context                                                                                                                                        | `create-and-reuse` | `index`  | `create-and-reuse` |
| Next                                                                                 | Replace configuration card with a link to the option's creation/configuration entry                                                                                                                                                               | `index`            | `index`  | `index`            |

### From Saved session policies

In every option, move the entire page to S, or retain it in place for option 2. Preserve these headings and their existing hashes:

| Current content                          | What must remain together at S                                                                                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opening definition and create example    | Dashboard label, `sc_…`, Python read/create gap and API alternative, TS/API examples, create-time snapshot semantics, later Dashboard edits do not affect existing sessions, project enablement and scoped read permission |
| Finding a config                         | List/get examples, summary versus full policy fields, pagination defaults/maximum, archived-only filter, `enable`/`disable` versus live `enabled`/`disabled`                                                               |
| What you can combine with a config       | Inline/local-tool conflicts, empty list counts as set, preserved per-session options, DIRECT_TOOLS positive scope and 1,000-tool limit, the existing live-verification limitation                                          |
| Applying a config to an existing session | All three tabs, access replacement/other settings preserved, null counts as set, inline custom-tool conflict, 400/409 behavior and reread/retry                                                                            |
| Which config a session came from         | Source ID after create/use/update, retention after inline updates, undefined without a policy, staleness until reloaded                                                                                                    |
| When a config can't be used              | No unrestricted fallback or retry without policy, missing/archived/cross-project 404, project 403, failed update leaves object unchanged                                                                                   |

## Boundaries shared by all options

Keep `/docs/sessions-via-mcp` in Guides, with all of its current content and hashes. The Sessions landing page and tool-loading page link to it. It owns endpoint/header setup, project versus user key scope, same-origin enforcement, approval fallback, fixed-tool MCP URL, framework wiring, and the limitations on SDK modifiers and local tools. Configuration pages explain the filters and preload/preset; they do not copy MCP connection recipes. Keep the MCP guide's fixed-tool example because it demonstrates transport wiring, and link it to the chosen tool-loading page.

Keep **Extend sessions** in Guides. Proxy execute owns raw authenticated API calls and session restrictions. Local tools and toolkits owns registration, local preload, context, reuse, and in-process execution. Shared connections owns account sharing and ACLs. Custom MCP owns bringing a remote MCP server's tools into Composio, the opposite direction from exposing a session over MCP. Link to these guides from Sessions rather than absorbing them.

Keep **Authentication**, **Sandboxes**, and **Governance** in their current positions. Sessions retains its account-selection and sandbox-option examples; those folders own full auth workflows, multiple accounts, account troubleshooting, compute/file workflows, per-action enforcement, hints, and approvals. Keep **Apps and toolkits**, **Toolkits**, the SDK/API references, and the legacy Sessions vs Direct Execution page. None becomes a new copy inside Sessions.

## URL and hash compatibility

The initial title-only proposal preserved `/docs/session-configs`. The approved implementation moves it to `/docs/sessions/saved-session-policies`, preserving all section headings and hashes. SDK/API terminology remains unchanged.

The implementation follows these compatibility rules:

- Use the path redirects listed under the chosen option. Cover `.md` and `.mdx` aliases as well as HTML routes, following the existing patterns in `next.config.mjs` and markdown routing. Keep saved-policy section anchors unchanged at the new destination.
- A server cannot see a URL fragment. A single redirect from the old configuration URL cannot route both `#direct-tools-preset` and `#concurrent-updates` to different pages. For every moved heading, keep an old-path compatibility page outside navigation with that heading's original anchor and a link to its mapped destination. Use this instead of an unconditional path redirect on that old URL while preserving bookmarks is required. Include a link at the top for readers arriving without a hash.
- Apply the same compatibility treatment to `/docs/how-composio-works` in options 1 and 3, where execution and lifecycle sections move away from the landing page. Option 2 can redirect it directly because the whole page and its headings stay together. If a moved section has a different generated hash, retain an explicit old anchor at its destination too.
- Inventory every real heading with the existing link validator's `github-slugger` behavior. Preserve method anchors such as `#tools` and `#executemeta--execute_meta` as generated, rather than guessing from API names. Update same-page links that now cross page boundaries.
- Update internal links/cards, relevant guardrail routing, search/agent metadata, and tests bound to these paths. Older redirects to the two split pages keep their compatibility-page destinations so incoming fragments still resolve. Aliases for a specific task can point directly to its canonical section. Avoid redirect chains. Do not hand-edit generated search/index files.

## Recommendation and follow-up

Choose option 1. The long page already has separate clusters for access, preload/presets, connections, sandbox settings, and updates. Giving those clusters task titles removes the need to scroll past unrelated examples. Keeping saved policies beside access restrictions explains their relationship without teaching a new policy system. Nine pages is a real navigation cost, but option 2 leaves a broad runtime-options page and option 3 adds nested choices plus a second reference hierarchy.

This recommendation comes from the current content and folder conventions. It does not claim reader research or measured improvements. Brendan selected option 1. Verify every mapping row and example group against the original content when changing these pages.

## Verification

Run from `docs/`:

```bash
bun run lint:links
bun run test
bun run check:code-examples
bun run check:api-snippets
bun run check:python-snippets
GITHUB_ACTIONS=true timeout 20m bun run build
```

Check that both sidebars expose the approved nine pages in order. The former overview and configuration bookmark pages keep all original anchors, with links to headings that exist at the destination. Saved-policy redirects cover HTML, `.md`, `.mdx`, and `/llms.mdx` forms. Internal links use the task pages. The page moves preserve all code examples and their validation markers.
