#!/usr/bin/env bash
#
# Create the GitHub Release as a DRAFT with every asset attached, or resume an existing
# draft by re-uploading (--clobber). Refuse to mutate a tag that is already published.
#
# Drafts fire no `release: published` event and are excluded from `/releases/latest`, so no
# anonymous consumer (install.sh, Homebrew, the redirect) can observe a release before its
# assets are attached and verified. The release is only flipped to published by a later step.
#
# Inputs (env): RELEASE_TAG, RELEASE_NAME, CHECKOUT_REF, PRERELEASE, GH_TOKEN
#               BINARIES_DIR (optional, defaults to the CLI dist dir)
set -euo pipefail

binaries_dir="${BINARIES_DIR:-ts/packages/cli/dist/binaries}"

flags=(
  --draft
  --title "$RELEASE_NAME"
  --target "$CHECKOUT_REF"
  --generate-notes
)
# Preserve prerelease status on the draft so betas stay prereleases once published.
if [[ "$PRERELEASE" == "true" ]]; then
  flags+=(--prerelease)
fi

# Idempotent for re-runs of a not-yet-published release: reuse an existing draft and clobber
# its assets. Refuse to mutate a tag that is already published.
if gh release view "$RELEASE_TAG" --json isDraft --jq '.isDraft' 2>/dev/null | grep -qx true; then
  echo "Draft $RELEASE_TAG already exists — re-uploading assets with --clobber"
  gh release upload "$RELEASE_TAG" \
    "$binaries_dir"/*.zip \
    "$binaries_dir/checksums.txt" --clobber
elif gh release view "$RELEASE_TAG" >/dev/null 2>&1; then
  # A red ❌ here is EXPECTED, not a bug, when two runs target the same tag (e.g. two quick CLI
  # version bumps): per-tag `concurrency` serializes them, the first publishes, and the second —
  # finding the tag already published — fails loudly here rather than silently clobbering a live
  # release. If you hit this, confirm the tag is genuinely published before re-running.
  echo "::error::Release $RELEASE_TAG is already published — refusing to mutate it. Investigate the publish path."
  exit 1
else
  gh release create "$RELEASE_TAG" "${flags[@]}" \
    "$binaries_dir"/*.zip \
    "$binaries_dir/checksums.txt"
fi
