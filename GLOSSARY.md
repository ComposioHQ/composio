# SDK release

How the TypeScript and Python SDKs go from merged changes to published packages on npm and PyPI.

## Language

**Language**:
One of the two SDK ecosystems a release covers: TypeScript (published to npm) or Python (published to PyPI).
_Avoid_: Lane, ecosystem, SDK

**Channel**:
The audience a release is for: stable, installed by default, or beta, installed only when asked for.
_Avoid_: Track, lane, prerelease mode

**Release request**:
A ComposioHQ member's ask to release, made through the release issue form or a workflow dispatch.
_Avoid_: Release issue, trigger

**Release batch**:
The versions planned for one release request, across both languages.
_Avoid_: Release plan, train

**Release PR**:
The bot-authored pull request that carries a release batch's version and changelog changes for review.
_Avoid_: Version PR, changeset PR

**Candidate**:
A package file built and smoke-tested on the release PR, which is exactly what gets published if the PR is approved.
_Avoid_: Artifact, build

**Publication**:
One package version on one registry.
_Avoid_: Upload, deploy
