# Context7 ownership and retrieval checks

Keep Context7's Composio index aligned with production documentation, then check that developers can retrieve concrete SDK examples.

Use the repository's pinned Node.js toolchain. After a completed refresh, capture a baseline from the repository root:

```bash
node scripts/context7-check.mjs --output context7-baseline.json
```

Public retrieval can run without a key, subject to Context7's quota. If needed, supply `CONTEXT7_API_KEY` through your shell's secret manager or CI secrets. Never commit a key or put one in a command example.

## Ownership and verified settings

- **TODO: accountable owner:** name one human who can access the library admin panel.
- **TODO: backup and teamspace:** name a backup human and the Context7 teamspace that owns access.
- **UNVERIFIED:** claimed ownership, team permissions, and effective admin settings require the owner's authenticated inspection. No claim, dashboard change, or refresh was performed for this change.

The repository and public production documentation were checked. Preserve this inventory:

| Setting               | Checked state                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library               | `/composiohq/composio`                                                                                                                                                                                                       |
| Description source    | [Production documentation index](https://docs.composio.dev/llms.txt): authentication, tool discovery, and tool execution for AI agents. Use a count-free description; app/toolkit counts differ across public pages.         |
| Branch                | GitHub default branch is `next`. `context7.json` omits `branch`, so Context7 defaults to the repository default. Public retrieved sources include `/blob/next/docs/content/`. Effective admin branch remains **UNVERIFIED**. |
| Included folders      | `docs/content`, `ts`, `python`, unchanged                                                                                                                                                                                    |
| Excluded folders      | `[]`, unchanged                                                                                                                                                                                                              |
| Excluded filenames    | `CHANGELOG.md`, `changelog.md`, `CHANGELOG.mdx`, `changelog.mdx`, `LICENSE.md`, `license.md`, `CODE_OF_CONDUCT.md`, `code_of_conduct.md`, unchanged                                                                          |
| Version configuration | `previousVersions: []`, unchanged                                                                                                                                                                                            |

Keep the API rules in `context7.json` aligned with production:

- Current REST base: `https://backend.composio.dev/api/v3.1`. The previous `/api/v3` remains supported and frozen with pinned tool-version defaults.
- Only these five v3.1 endpoints default to the latest toolkit version rather than `00000000_00`: `GET /tools`, `GET /tools/{tool_slug}`, `POST /tools/execute/{tool_slug}`, `POST /tools/execute/{tool_slug}/input`, and `POST /tools/scopes/required`.
- Request the pinned version explicitly with `version=00000000_00`, or `toolkit_versions=00000000_00` for `GET /tools`.
- TypeScript `@composio/core` and Python `composio` already use v3.1 through the generated client. The migration guidance concerns direct REST calls.

The tool-version policy previously occupied one rule longer than the [Context7 schema's 255-character limit](https://context7.com/schema/context7.json). It is now split into shorter rules with the same policy, including the v3.1-only scopes endpoint. Offline tests enforce this limit; `$schema` also exposes it to editors. The REST policy is checked against the [production API reference](https://docs.composio.dev/reference.md).

## Claim and verify the library

Follow Context7's [library claiming instructions](https://context7.com/docs/howto/claiming-libraries.md):

1. Sign in as the accountable human and open [Composio's admin page](https://context7.com/composiohq/composio/admin), or choose **Manage** on its dashboard card.
2. If unclaimed, click **Claim Library** and copy the modal's generated `url` and `public_key`.
3. Merge those two fields into the **existing root `context7.json`**. Do not replace the file with the modal's minimal snippet. Preserve the description, folders, exclusions, API rules, and version settings. The `url` must exactly match `https://context7.com/composiohq/composio`; use the actual generated public key, not a placeholder. This public claim key is not the secret API key.
4. Commit and merge that configuration to the default branch, `next`. Once the file is publicly reachable there, return to the modal and click **Claim Library** to verify ownership.
5. If already claimed, confirm the owning teamspace and your owner/admin role instead of claiming again. Arrange backup access.
6. Inspect **Configuration** and **Versions**. Record the effective description, branch, include/exclude settings, custom rules, and versions, including any dashboard overrides. Compare them with the inventory above. Resolve mismatches without changing folder/exclusion rules, then record the verification date, owner, and evidence in the issue or PR.

Ownership verification here means access and settings verification, not a claim that Context7's separate verified badge was granted.

## Refresh after a production documentation deploy

**Manual operational policy:** the owner refreshes after **each successful production documentation deploy**, once the canonical production site serves that deployment. Never refresh merely because of a push, a preview deploy, or a failed deploy.

There is no automatic refresh hook in this change. Deployment metadata is ambiguous: deployments labeled `Production` have reported preview hostnames or empty environment URLs. Before wiring automation, verify the canonical documentation deployment service, its success signal, and how that signal identifies the revision actually serving production. An environment label or hostname alone is not sufficient evidence.

Confirm that the `next` branch already exists in Context7's **Versions** or branch configuration before requesting a branch-specific refresh. The [current refresh API](https://context7.com/docs/api-reference/refresh/refresh-a-library) refreshes an existing library/version; it does not create the branch entry.

With an owner-authorized key supplied securely as `CONTEXT7_API_KEY`, run:

```bash
curl --fail-with-body --request POST \
  'https://context7.com/api/v1/refresh' \
  --header "Authorization: Bearer ${CONTEXT7_API_KEY:?Set an owner-authorized Context7 key}" \
  --header 'Content-Type: application/json' \
  --data '{"libraryName":"/composiohq/composio","branch":"next"}'
```

A `200` response means the refresh **started**, not that indexing finished. Wait for Context7 to report completion and confirm the indexed branch/revision before running the baseline command. Record the production deploy revision, refresh request/completion times, indexed revision/branch, and effective settings. If Context7 doesn't expose a revision, explicitly record that limitation and retain the completion status and retrieved source evidence; don't invent a revision.

## Run and retain retrieval evidence

```bash
# Offline runner tests, with no Context7 requests.
node --test test/context7-check.test.mjs

# Live retrieval baseline, after indexing completes.
node scripts/context7-check.mjs --output context7-baseline.json
```

The **Context7 Retrieval Check** GitHub Actions workflow (`.github/workflows/context7-check.yml`) is manually dispatched. It checks retrieval, not deployment success or refresh completion, and does not refresh the library.

The suite is `scripts/context7-queries.json`. The runner calls `GET https://context7.com/api/v2/context` with `libraryId`, `query`, and `type=json`, without bypassing reranking. Each query prints `PASS`, `FAIL`, or `ERROR`, followed by totals; any failure or error exits nonzero.

Each expected-fact group is required. Any literal alternative in a group may match, case-insensitively with normalized whitespace, in a retrieved snippet's **body**. Groups may match different snippets. Titles and source URLs don't count as facts.

Attach the JSON report to the PR. It preserves query IDs and text, expected facts, production sources, retrieved snippet bodies, the timestamps, the suite's SHA256, and the local configuration snapshot. Retain console totals and the deployment/index/settings record alongside it. Distinguish missing facts (`FAIL`) from retrieval or request errors (`ERROR`); review the actual snippets before drawing conclusions. A failing first baseline identifies existing retrieval gaps, not proof of a newly introduced regression. These are lexical checks, not a semantic correctness guarantee.

## Gate folder or exclusion changes on evidence

Don't narrow indexing to `docs/content` or change exclusions based on intuition. Before proposing a folder-rule change:

1. Freeze the query suite and record its SHA256. After a completed refresh, capture `context7-before.json` using the baseline command with `--output context7-before.json`. Record the indexed revision/branch and all effective settings.
2. Record the proposed include/exclude diff. Keep the source revision, branch, API rules, description, query suite, and retrieval options constant so the comparison isolates the folder change. If those differ, don't treat the reports as a controlled comparison.
3. With owner approval, apply the candidate settings and refresh under the policy above. Wait for completion, then run the **same suite with the same hash** using `--output context7-after.json`. Record the resulting indexed revision/branch and settings.
4. Attach both reports, retrieved snippet bodies, refresh evidence, and the settings diff. Review every failure and error, including regressions in SDK examples and version guidance. Don't weaken expected facts to make the candidate pass.
5. Keep the existing folder/exclusion rules unless the evidence supports the proposed change. If the suite needs correction, review that correction separately and rerun both baselines with the new identical suite/hash.
