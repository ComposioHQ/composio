# Release the Python SDK

Request a stable Python release through the shared [SDK release procedure](../../ts/docs/internal/release.md). Every active ComposioHQ member can use the release issue form. Leave Python at `auto` for Changesets recommendations, or select a patch, minor, or major override. Set TypeScript to `skip` for Python only.

Public Python SDK/provider changes include a Changesets note targeting the private `@composio/python-sdk` marker. Core and supported providers form one stable train. The bot updates metadata mirrors and `uv.lock` and opens one release PR. Its `SDK candidate (python)` check builds the wheels and sdists; `SDK candidate smoke (python)` installs them in a clean venv and tests the candidate core with the latest published providers. A repository writer who did not request the release approves the final head, and a person merges it. The tag run publishes those exact files through the tag-only `pypi-release` identity.

If publishing fails, choose **Re-run failed jobs** on the tag run within 30 days of the candidate build. After that, request a new release with **Supersede a stranded release**; the whole Python lane moves one version above the stranded one.

For local packaging checks, run from `python/`:

```bash
make build
```

The release pipeline installs locked build tools from the root workspace's `release` dependency group and builds with `BUILD_ARGS=--no-isolation`. Update generated-client pins only after verifying that the client version exists, and regenerate `uv.lock` with uv.

The legacy `py.release.yml` keeps build-only dispatch and core-prerelease publishing. Actual `main` beta metadata and its existing trusted identity are preserved. Stable releases use the shared workflow rather than manual version bumps, `py@` tags, or SDK GitHub Releases.
