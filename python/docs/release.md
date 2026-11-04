# Release the Python SDK

Request a stable Python release through the shared [SDK release procedure](../../ts/docs/internal/release.md). Every active ComposioHQ member can use the release issue form. Leave Python at `auto` for Changesets recommendations, or select a patch, minor, or major override. Set TypeScript to `skip` for Python only.

Public Python SDK/provider changes include a Changesets note targeting the private `@composio/python-sdk` marker. Core and supported providers form one stable train. The coordinator updates metadata mirrors and `uv.lock`, prepares the wheel/sdist candidates, and opens one release PR. A repository writer other than the requester approves its final head; automation publishes the exact approved candidates through the tag-only `pypi-release` identity.

Inspect the request's canonical status for package and docs verification. Retry with its original run ID. Recovery reuses original candidates for at most 30 days or 50 attempts, ending earlier if artifacts disappear. A terminal partial batch needs a newly approved higher-version corrective release. Docs-only retries remain available after that window and never upload packages.

For local packaging checks, run from `python/`:

```bash
make build
```

The release pipeline installs locked build tools from the root workspace's `release` dependency group and builds with `BUILD_ARGS=--no-isolation`. Update generated-client pins only after verifying that the client version exists, and regenerate `uv.lock` with uv.

The legacy `py.release.yml` keeps build-only dispatch and core-prerelease publishing. Actual `main` beta metadata and its existing trusted identity are preserved. Stable releases use the shared workflow rather than manual version bumps, `py@` tags, or SDK GitHub Releases.
