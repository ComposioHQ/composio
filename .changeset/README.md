# SDK release notes

Include a Changeset when a PR changes published SDK behavior. Use `pnpm changeset`
and select each affected TypeScript package or `@composio/python-sdk` for Python.
One note can cover both SDKs. Recommend `patch`, `minor`, or `major` and describe the
user-visible change. Python core and all supported providers release together.
The private Python marker is versioned by Changesets and never published to npm.
The CLI uses its own release process and must not appear in SDK Changesets.

Docs, tests, internal tooling and CLI-only changes need no SDK note. If a change
under SDK source has no public effect, explain it in the PR description:

```html
<!-- sdk-release-note-exempt: Explain why this change has no published behavior. -->
```

