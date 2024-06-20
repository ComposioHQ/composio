# Release process for composio core and plugin packages

1. Decide type of version change from `major/minor/patch/prerelease/postrelease`
2. Perform version bump using `python scripts/bump.py --major/--minor/--patch/--pre/--post`
3. Checkout to release branch - `release/v{version}` (eg. `release/v0.2.23`)
4. Update `CHANGELOG.md` with release notes containing changes from previous release
5. Commit changes and create a PR
6. After the PR is merged create a release with the version as title and release notes
