# KB Freshness Verification

## Decision

Verify published knowledge base guides mechanically against production data on
every catalog refresh, rather than relying on the `reviewAfter` calendar alone.

`docs-update-data.yml` already refreshes `public/data/toolkits.json` and the
OpenAPI specs every five hours and on every Apollo production deploy. A new
`verify:kb` step runs immediately after that refresh and checks each published
guide's mechanical claims against the snapshot the docs site is about to ship.

Findings never block the data sync. They are written to the job summary and to a
single long-lived `kb-freshness` issue, which the job closes when the KB verifies
clean.

## Context

The KB carries two kinds of claim. Most are mechanically checkable — a tool slug
exists, a toolkit is in the catalog, a provider doc link resolves. The rest need
human judgement.

Review dates treat both kinds identically, which has two costs. Checkable claims
wait months for a human to confirm something a script can confirm in seconds, and
the human queue fills with work that did not need a human. An audit of the source
corpus found 36 of 180 cited action identifiers already absent from the catalog;
this check found one of them — `CANVAS_GET_ACCOUNTS` — live in a published guide.

Review dates also fail late. `reviewAfter` expiry throws during catalog assembly,
so an expired guide breaks the docs build rather than quietly unpublishing. At
the time of writing, 22 of 27 published guides share a single `reviewAfter` date,
so they expire together and the cheapest response on that day is to bump the
dates rather than re-verify. The verifier reports that cohort as a finding.

## What Is Checked

| Check | Source of truth | Severity |
| --- | --- | --- |
| Cited tool and trigger slugs exist | `public/data/toolkits.json` | error |
| Linked toolkits exist | `public/data/toolkits.json` | error |
| Provider doc links resolve | live HTTP, `--check-links` | error on 404/410 |
| Review window not expired | manifest | error |
| Guides sharing one `reviewAfter` date | manifest | warning |
| Verification age past threshold | manifest | warning |
| `manifest.source.commit` resolves upstream | GitHub API, `--check-source-pin` | warning |

The source pin is a provenance claim, not a build dependency: the cited sections
are vendored under `kb/source`, so the site builds whether or not the commit
resolves. An unresolvable pin means no one can audit what a published guide was
derived from, and it blocks source-drift detection, which must diff the vendored
copy against upstream. Resolution distinguishes "missing" from "this token
cannot read that repository" so a narrow token reports nothing rather than
reporting false breakage.

Three exclusions keep the report trustworthy enough to act on. A permanently red
report is one nobody reads.

- **Placeholders.** `<COMPOSIO_API_KEY>` and `$TOKEN` share the shape of a tool
  slug and will never appear in a catalog. A token is treated as a placeholder
  only when every appearance is wrapped.
- **Bare URLs.** Only markdown link targets are probed. Bare URLs in prose and
  code samples are API hosts (`https://api.ahrefs.com/v3`) where 401 or 404 is
  the correct response.
- **Rate limiting.** 5xx and 429 mean the provider is throttling the probe, not
  that the page is gone.

A guide whose subject is a removed identifier declares it in
`verifyIgnoreToolSlugs`, so the exemption is reviewable in the manifest rather
than hidden in the checker.

## `kb/source` Is A Verbatim Snapshot

The first publish tranche shipped before `articlePath` existed, so those guides
were published by rewriting the prose in place inside `kb/source` — turning
support-agent voice into customer voice. That silently made the snapshot a
derivative of the commit it claims to come from: nine of twenty-five sources no
longer matched upstream.

Provenance is only meaningful if the snapshot is verbatim, and drift detection is
impossible against a baseline that was already edited — every future comparison
would report permanent false drift on those nine files.

Those guides now carry `articlePath` like the rest, and their sources are
restored to the upstream bytes. Published output is unchanged; the article body
renders exactly the prose the source previously supplied. A regression test
asserts no published guide renders from the source snapshot.

## Consequences

- Checkable claims are verified on every production deploy instead of quarterly.
- Human review narrows to prose that cannot be checked mechanically.
- A guide contradicting production is visible within hours, in one tracked issue
  that closes itself.
- The checker must keep working when the build gate has tripped, so it assembles
  the catalog with a floor date and re-checks expiry against the real clock.
- Coverage — questions with no article at all — is out of scope here. That is a
  demand-side signal and is measured from support ticket volume, not from the
  catalog.
